import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as prepareCopies } from "../app/api/creator/guest-desk/copies/route";
import { POST as recordCopy } from "../app/api/creator/guest-desk/copy/route";
import { POST as loadPage } from "../app/api/creator/guest-desk/page/route";
import { getOptionalConfirmedUser } from "../src/server/auth/session";
import {
  buildPersonalizedInvitationUrl,
  getRecoverableGuestLinks,
  listGuestPartyPage,
  loadDeliveredGuestInvitation,
  recordGuestInvitationCopy,
} from "../src/server/guests/guests";
import { buildPersonalInvitationMessage } from "../src/server/guests/sharing";
import { decryptGuestLinkToken } from "../src/server/guests/tokens";

vi.mock("../src/server/auth/session", () => ({ getOptionalConfirmedUser: vi.fn() }));
vi.mock("../src/server/guests/guests", () => ({
  buildPersonalizedInvitationUrl: vi.fn(),
  getRecoverableGuestLinks: vi.fn(),
  listGuestPartyPage: vi.fn(),
  loadDeliveredGuestInvitation: vi.fn(),
  recordGuestInvitationCopy: vi.fn(),
}));
vi.mock("../src/server/guests/sharing", () => ({ buildPersonalInvitationMessage: vi.fn() }));
vi.mock("../src/server/guests/tokens", () => ({ decryptGuestLinkToken: vi.fn() }));

const invitationId = "72000000-0000-4000-8000-000000000001";
const partyId = "73000000-0000-4000-8000-000000000001";
const linkId = "75000000-0000-4000-8000-000000000001";
const workspaceId = "71000000-0000-4000-8000-000000000001";

function request(path: string, body: unknown, headers?: HeadersInit) {
  return new Request(`https://invitica.app${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

function session() {
  const rpc = vi.fn().mockResolvedValue({ data: workspaceId, error: null });
  vi.mocked(getOptionalConfirmedUser).mockResolvedValue({
    supabase: { rpc } as never,
    user: {} as never,
  });
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("private Guest Desk data routes", () => {
  it("loads a bounded creator page with private no-store headers", async () => {
    session();
    vi.mocked(listGuestPartyPage).mockResolvedValue({
      hasMore: false,
      nextOffset: 0,
      parties: [],
    });

    const input = {
      invitationId,
      offset: 0,
      query: "",
      responseFilter: "all",
    };
    const response = await loadPage(request("/api/creator/guest-desk/page", input));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({
      page: { hasMore: false, nextOffset: 0, parties: [] },
      status: "ready",
    });
    expect(listGuestPartyPage).toHaveBeenCalledWith(
      { rpc: expect.any(Function) },
      invitationId,
      input,
    );
  });

  it("rejects signed-out and oversized page reads before database access", async () => {
    vi.mocked(getOptionalConfirmedUser).mockResolvedValue(null);

    const signedOut = await loadPage(
      request("/api/creator/guest-desk/page", {
        invitationId,
        offset: 0,
        query: "",
        responseFilter: "all",
      }),
    );
    const oversized = await loadPage(
      request("/api/creator/guest-desk/page", {}, { "content-length": "4096" }),
    );

    expect(signedOut.status).toBe(401);
    expect(oversized.status).toBe(400);
    expect(listGuestPartyPage).not.toHaveBeenCalled();
  });

  it("prepares all visible private invitation copies through one batched read", async () => {
    const rpc = session();
    vi.mocked(loadDeliveredGuestInvitation).mockResolvedValue({
      celebrantPronoun: "they",
      generalShareMessage: null,
      genericUrl: `https://invitica.app/i/mara-${"a".repeat(32)}`,
      invitationId,
      occasion: "Wedding",
      personalShareMessage: null,
      publicIdentifier: "a".repeat(32),
      title: "Mara & Joaquin",
    });
    vi.mocked(getRecoverableGuestLinks).mockResolvedValue([
      {
        ciphertext: "A".repeat(79),
        guestPartyId: partyId,
        keyVersion: 1,
        linkId,
        nonce: "A".repeat(16),
        recipientName: "Tita Lena",
      },
    ]);
    vi.mocked(decryptGuestLinkToken).mockReturnValue("B".repeat(43));
    vi.mocked(buildPersonalizedInvitationUrl).mockReturnValue(
      `https://invitica.app/i/mara-${"a".repeat(32)}#g=${"B".repeat(43)}`,
    );
    vi.mocked(buildPersonalInvitationMessage).mockReturnValue("Hi Tita Lena!");

    const response = await prepareCopies(
      request("/api/creator/guest-desk/copies", {
        guestPartyIds: [partyId],
        invitationId,
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("ensure_personal_workspace");
    expect(getRecoverableGuestLinks).toHaveBeenCalledWith({ rpc }, invitationId, [partyId]);
    expect(await response.json()).toEqual({
      copies: [
        {
          copyText: "Hi Tita Lena!",
          guestPartyId: partyId,
          personalizedUrl: `https://invitica.app/i/mara-${"a".repeat(32)}#g=${"B".repeat(43)}`,
        },
      ],
      status: "ready",
    });
  });

  it("records copy bookkeeping without exposing authentication or persistence failures", async () => {
    session();
    vi.mocked(recordGuestInvitationCopy).mockResolvedValue();

    const recorded = await recordCopy(
      request("/api/creator/guest-desk/copy", { guestPartyId: partyId }),
    );
    expect(await recorded.json()).toEqual({ status: "recorded" });
    expect(recordGuestInvitationCopy).toHaveBeenCalledWith({ rpc: expect.any(Function) }, partyId);

    vi.mocked(getOptionalConfirmedUser).mockResolvedValue(null);
    const ignored = await recordCopy(
      request("/api/creator/guest-desk/copy", { guestPartyId: partyId }),
    );
    expect(ignored.status).toBe(200);
    expect(await ignored.json()).toEqual({ status: "ignored" });
  });

  it("keeps route failures generic", async () => {
    session();
    vi.mocked(listGuestPartyPage).mockRejectedValue(new Error("private database detail"));
    const response = await loadPage(
      request("/api/creator/guest-desk/page", {
        invitationId,
        offset: 0,
        query: "",
        responseFilter: "all",
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database detail");
  });
});
