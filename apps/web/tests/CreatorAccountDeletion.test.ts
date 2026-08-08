import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDeleteUser: vi.fn(),
  purgePublishedInvitationObjects: vi.fn(),
  readPublishedInvitationObjects: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  requireConfirmedUser: vi.fn(),
  revalidatePath: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn() })),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../src/server/auth/session", () => ({
  requireConfirmedUser: mocks.requireConfirmedUser,
}));
vi.mock("../src/server/auth/redirects", () => ({
  getSiteOrigin: () => "https://invitica.example",
}));
vi.mock("../src/server/account/email", () => ({
  emailSendingConfigured: () => true,
  sendEmail: mocks.sendEmail,
}));
vi.mock("../src/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { deleteUser: mocks.adminDeleteUser } } }),
}));
vi.mock("../src/server/media/object-store", () => ({
  R2MediaObjectStore: class {},
  readR2MediaConfig: () => ({}),
}));

// The real purge module is exercised by its own suite; here the order it is called in is the thing
// under test, so both halves are observed rather than executed.
vi.mock("../src/server/invitations/publication-purge", () => ({
  PublishedInvitationPurgeError: class PublishedInvitationPurgeError extends Error {},
  purgePublishedInvitationObjects: mocks.purgePublishedInvitationObjects,
  readPublishedInvitationObjects: mocks.readPublishedInvitationObjects,
}));

import { confirmAccountDeletion, requestAccountDeletion } from "../src/server/account/actions";
import { createDeletionToken, hashDeletionToken } from "../src/server/account/deletion";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function session(overrides: { from?: unknown; rpc?: unknown } = {}) {
  return {
    supabase: {
      auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
      from: overrides.from ?? vi.fn(() => ({ select: () => ({ data: [], error: null }) })),
      rpc: overrides.rpc ?? vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    user: { email: "creator@example.invalid", id: USER_ID },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminDeleteUser.mockResolvedValue({ error: null });
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.readPublishedInvitationObjects.mockResolvedValue({ aliasKey: null, artifactKeys: [] });
  mocks.purgePublishedInvitationObjects.mockResolvedValue(undefined);
});

describe("the deletion token", () => {
  /**
   * The raw token exists in the emailed link and nowhere else. A read of the table must yield
   * nothing replayable, which is only true if what is stored is the digest.
   */
  it("stores a digest of the token, never the token", () => {
    const { hash, token } = createDeletionToken();

    expect(hash).toEqual(createHash("sha256").update(token, "utf8").digest());
    expect(hash.toString("hex")).not.toContain(token);
    expect(hash).toHaveLength(32);
  });

  it("draws a new 256-bit token every time", () => {
    const first = createDeletionToken().token;
    const second = createDeletionToken().token;

    expect(first).not.toBe(second);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
  });

  it("hashes deterministically, so the same link resolves twice", () => {
    expect(hashDeletionToken("abc")).toEqual(hashDeletionToken("abc"));
    expect(hashDeletionToken("abc")).not.toEqual(hashDeletionToken("abd"));
  });
});

describe("requesting a deletion", () => {
  it("opens the request and emails a link carrying the raw token", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.requireConfirmedUser.mockResolvedValue(session({ rpc }));

    const state = await requestAccountDeletion();

    expect(rpc).toHaveBeenCalledWith(
      "request_account_deletion",
      expect.objectContaining({ p_token_hash: expect.stringMatching(/^\\x[0-9a-f]{64}$/) }),
    );
    const [message] = mocks.sendEmail.mock.calls[0] as [{ text: string; to: string }];
    expect(message.to).toBe("creator@example.invalid");
    expect(message.text).toContain("https://invitica.example/account/delete/confirm?token=");
    // Nothing has happened to the account yet, and the wording has to say so.
    expect(state.error).toBeNull();
    expect(state.notice).toContain("untouched");
  });

  it("does not report success when the email could not be sent", async () => {
    mocks.requireConfirmedUser.mockResolvedValue(session());
    mocks.sendEmail.mockRejectedValue(new Error("provider down"));

    const state = await requestAccountDeletion();

    expect(state.error).toContain("could not send");
    expect(state.notice).toBeUndefined();
  });
});

describe("confirming a deletion", () => {
  it("refuses a token the database will not claim, and deletes nothing", async () => {
    for (const [reported, expected] of [
      ["expired", "expired"],
      ["used", "already been used"],
      ["unknown", "not valid"],
    ] as const) {
      vi.clearAllMocks();
      mocks.requireConfirmedUser.mockResolvedValue(
        session({ rpc: vi.fn().mockResolvedValue({ data: reported, error: null }) }),
      );

      const state = await confirmAccountDeletion("a-token");

      expect(state.error).toContain(expected);
      expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
      expect(mocks.purgePublishedInvitationObjects).not.toHaveBeenCalled();
    }
  });

  it("rejects a missing token before reaching the database", async () => {
    const rpc = vi.fn();
    mocks.requireConfirmedUser.mockResolvedValue(session({ rpc }));

    expect((await confirmAccountDeletion("")).error).toContain("not valid");
    expect((await confirmAccountDeletion(null)).error).toContain("not valid");
    expect(rpc).not.toHaveBeenCalled();
  });

  /**
   * The ordering rule this whole path exists to honour. The Viewer resolves an invitation from R2
   * and never reads Postgres, so removing the account first would leave every shared link serving
   * the event with nothing left in the database to find it by.
   */
  it("takes published invitations off the guest edge before removing the account", async () => {
    const order: string[] = [];
    mocks.purgePublishedInvitationObjects.mockImplementation(async () => {
      order.push("purge");
    });
    mocks.adminDeleteUser.mockImplementation(async () => {
      order.push("delete-user");
      return { error: null };
    });
    mocks.requireConfirmedUser.mockResolvedValue(
      session({
        from: vi.fn(() => ({
          select: () => ({ data: [{ id: "inv-1" }, { id: "inv-2" }], error: null }),
        })),
        rpc: vi.fn().mockResolvedValue({ data: "claimed", error: null }),
      }),
    );

    await expect(confirmAccountDeletion("a-token")).rejects.toThrow("REDIRECT:");

    expect(order).toEqual(["purge", "purge", "delete-user"]);
    expect(mocks.adminDeleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("leaves the account intact when a guest link cannot be taken down", async () => {
    const { PublishedInvitationPurgeError } = await import(
      "../src/server/invitations/publication-purge"
    );
    mocks.purgePublishedInvitationObjects.mockRejectedValue(new PublishedInvitationPurgeError());
    mocks.requireConfirmedUser.mockResolvedValue(
      session({
        from: vi.fn(() => ({ select: () => ({ data: [{ id: "inv-1" }], error: null }) })),
        rpc: vi.fn().mockResolvedValue({ data: "claimed", error: null }),
      }),
    );

    const state = await confirmAccountDeletion("a-token");

    // A dead account whose invitations are still being opened is the failure worth avoiding.
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
    expect(state.error).toContain("nothing was deleted");
  });

  it("claims the token rather than only reading it", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "claimed", error: null });
    mocks.requireConfirmedUser.mockResolvedValue(session({ rpc }));

    await expect(confirmAccountDeletion("a-token")).rejects.toThrow("REDIRECT:");

    expect(rpc).toHaveBeenCalledWith(
      "resolve_account_deletion",
      expect.objectContaining({ p_claim: true }),
    );
  });
});
