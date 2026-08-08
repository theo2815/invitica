import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  requireConfirmedUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../src/server/auth/session", () => ({
  requireConfirmedUser: mocks.requireConfirmedUser,
}));
vi.mock("../src/server/auth/redirects", () => ({
  getSiteOrigin: () => "https://invitica.example",
}));

import {
  changeEmailAddress,
  changePassword,
  deleteAssistantConversations,
  signOutEverywhere,
  updateCreatorName,
} from "../src/server/account/actions";

interface SessionOverrides {
  email?: string | undefined;
  providers?: string[];
}

function session(auth: Record<string, unknown>, overrides: SessionOverrides = {}) {
  const { email = "creator@example.invalid", providers = ["email"] } = overrides;
  return {
    supabase: { auth },
    user: {
      created_at: "2026-01-04T00:00:00.000Z",
      email,
      id: "11111111-1111-4111-8111-111111111111",
      identities: providers.map((provider) => ({ provider })),
      user_metadata: { full_name: "Maria Santos" },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("changing a password from settings", () => {
  /**
   * The defect this whole surface exists for. Before settings, `updatePassword` demanded a
   * verified recovery cookie and `requestPasswordReset` was closed by `publicAuthLocked()`, so a
   * signed-in creator on the production site had no path to a new password at all.
   */
  it("changes the password after re-verifying the current one", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.requireConfirmedUser.mockResolvedValue(
      session({ signInWithPassword, signOut, updateUser }),
    );

    const formData = new FormData();
    formData.set("currentPassword", "the-old-one");
    formData.set("password", "a-brand-new-one");
    formData.set("confirmPassword", "a-brand-new-one");

    const state = await changePassword({ error: null }, formData);

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "creator@example.invalid",
      // Empty because no Turnstile site key is configured in tests. The key's presence is what
      // makes this carry a token; the re-verification call needs one because it reaches the same
      // captcha-protected endpoint the sign-in form does.
      options: {},
      password: "the-old-one",
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "a-brand-new-one" });
    expect(state.error).toBeNull();
    expect(state.notice).toContain("changed");
  });

  it("refuses a wrong current password without touching the account", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: { message: "Invalid" } });
    const updateUser = vi.fn();
    mocks.requireConfirmedUser.mockResolvedValue(session({ signInWithPassword, updateUser }));

    const formData = new FormData();
    formData.set("currentPassword", "not-the-password");
    formData.set("password", "a-brand-new-one");
    formData.set("confirmPassword", "a-brand-new-one");

    const state = await changePassword({ error: null }, formData);

    expect(updateUser).not.toHaveBeenCalled();
    expect(state.fieldErrors?.currentPassword).toBe("That is not your current password.");
  });

  /**
   * A live session is not proof that whoever holds it knows the password. Leaving other devices
   * signed in on the old one defeats the reason most people change a password.
   */
  it("signs other devices out but keeps this session", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.requireConfirmedUser.mockResolvedValue(
      session({
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        signOut,
        updateUser: vi.fn().mockResolvedValue({ error: null }),
      }),
    );

    const formData = new FormData();
    formData.set("currentPassword", "the-old-one");
    formData.set("password", "a-brand-new-one");
    formData.set("confirmPassword", "a-brand-new-one");
    await changePassword({ error: null }, formData);

    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("refuses when the new password repeats the current one", async () => {
    const updateUser = vi.fn();
    mocks.requireConfirmedUser.mockResolvedValue(session({ updateUser }));

    const formData = new FormData();
    formData.set("currentPassword", "the-same-one");
    formData.set("password", "the-same-one");
    formData.set("confirmPassword", "the-same-one");

    const state = await changePassword({ error: null }, formData);

    expect(updateUser).not.toHaveBeenCalled();
    expect(state.fieldErrors?.password).toContain("different");
  });

  it("tells a Google account that it has no Invitica password", async () => {
    const signInWithPassword = vi.fn();
    mocks.requireConfirmedUser.mockResolvedValue(
      session({ signInWithPassword }, { providers: ["google"] }),
    );

    const formData = new FormData();
    formData.set("currentPassword", "anything");
    formData.set("password", "a-brand-new-one");
    formData.set("confirmPassword", "a-brand-new-one");

    const state = await changePassword({ error: null }, formData);

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(state.error).toContain("Google");
  });
});

describe("changing the email address", () => {
  it("requests the change and says nothing has moved yet", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    mocks.requireConfirmedUser.mockResolvedValue(session({ updateUser }));

    const formData = new FormData();
    formData.set("email", "new@example.invalid");

    const state = await changeEmailAddress({ error: null }, formData);

    // The redirect matters: without it Supabase returns a confirming creator to the Site URL —
    // the public landing page — with no sign that anything happened.
    expect(updateUser).toHaveBeenCalledWith(
      { email: "new@example.invalid" },
      { emailRedirectTo: "https://invitica.example/auth/confirm?next=/dashboard/settings" },
    );
    // Supabase applies the address only after both links are followed. Reporting it as done
    // would leave a creator signing in with an address they believe is gone.
    expect(state.notice).toContain("creator@example.invalid");
    expect(state.notice).toContain("new@example.invalid");
  });

  it("refuses the address the creator already has", async () => {
    const updateUser = vi.fn();
    mocks.requireConfirmedUser.mockResolvedValue(session({ updateUser }));

    const formData = new FormData();
    formData.set("email", "Creator@Example.Invalid");

    const state = await changeEmailAddress({ error: null }, formData);

    expect(updateUser).not.toHaveBeenCalled();
    expect(state.fieldErrors?.email).toBe("This is already your email address.");
  });
});

describe("the rest of the account panels", () => {
  it("writes the name to the metadata the shell reads", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    mocks.requireConfirmedUser.mockResolvedValue(session({ updateUser }));

    const formData = new FormData();
    formData.set("fullName", "  Maria  Clara   Santos ");

    const state = await updateCreatorName({ error: null }, formData);

    expect(updateUser).toHaveBeenCalledWith({ data: { full_name: "Maria Clara Santos" } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    expect(state.notice).toBeTruthy();
  });

  it("ends every session, this one included", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.requireConfirmedUser.mockResolvedValue(session({ signOut }));

    await expect(signOutEverywhere()).rejects.toThrow("REDIRECT:");

    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("deletes saved conversations scoped to the creator who asked", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: del }));
    mocks.requireConfirmedUser.mockResolvedValue({
      ...session({}),
      supabase: { auth: {}, from },
    });

    const state = await deleteAssistantConversations();

    expect(from).toHaveBeenCalledWith("assistant_conversations");
    // Row-level security is the boundary, and the explicit filter is the second control. A
    // delete that reached this table without one would have no `where` clause at all.
    expect(eq).toHaveBeenCalledWith("creator_id", "11111111-1111-4111-8111-111111111111");
    expect(state.error).toBeNull();
  });
});
