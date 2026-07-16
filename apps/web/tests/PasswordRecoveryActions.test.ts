import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieDelete: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: mocks.cookieDelete,
    get: mocks.cookieGet,
    set: mocks.cookieSet,
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("../src/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("../src/server/auth/redirects", () => ({
  getSiteOrigin: vi.fn(() => "https://invitica.example"),
}));

vi.mock("../src/server/auth/session", () => ({
  ensurePersonalWorkspace: vi.fn(),
}));

import {
  requestPasswordReset,
  updatePassword,
  verifyRecoveryCode,
} from "../src/server/auth/actions";

const recoveryEmailCookie = "invitica-recovery-email";
const recoveryVerifiedCookie = "invitica-recovery-verified";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("password recovery actions", () => {
  it("requests a recovery email without putting the address in the redirect URL", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      auth: { resetPasswordForEmail },
    });
    const formData = new FormData();
    formData.set("email", "creator@example.invalid");

    await expect(requestPasswordReset({ error: null }, formData)).rejects.toThrow(
      "REDIRECT:/forgot-password/verify",
    );

    expect(resetPasswordForEmail).toHaveBeenCalledWith("creator@example.invalid", {
      redirectTo: "https://invitica.example/reset-password",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      recoveryEmailCookie,
      "creator@example.invalid",
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
    expect(mocks.redirect).not.toHaveBeenCalledWith(expect.stringContaining("creator"));
  });

  it("verifies a recovery OTP and creates a short-lived recovery session", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    mocks.cookieGet.mockImplementation((name: string) =>
      name === recoveryEmailCookie ? { value: "creator@example.invalid" } : undefined,
    );
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp } });
    const formData = new FormData();
    formData.set("otp", "123456");

    await expect(verifyRecoveryCode({ error: null }, formData)).rejects.toThrow(
      "REDIRECT:/reset-password",
    );

    expect(verifyOtp).toHaveBeenCalledWith({
      email: "creator@example.invalid",
      token: "123456",
      type: "recovery",
    });
    expect(mocks.cookieDelete).toHaveBeenCalledWith(recoveryEmailCookie);
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      recoveryVerifiedCookie,
      "verified",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("refuses a password change without a verified recovery session", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    const formData = new FormData();
    formData.set("password", "a-new-secure-password");
    formData.set("confirmPassword", "a-new-secure-password");

    await expect(updatePassword({ error: null }, formData)).resolves.toEqual({
      error: "Your recovery session has expired. Request a new code to change your password.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("changes the password, signs out, and returns to login", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "10000000-0000-4000-8000-000000000001" } },
      error: null,
    });
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.cookieGet.mockImplementation((name: string) =>
      name === recoveryVerifiedCookie ? { value: "verified" } : undefined,
    );
    mocks.createClient.mockResolvedValue({
      auth: { getUser, signOut, updateUser },
    });
    const formData = new FormData();
    formData.set("password", "a-new-secure-password");
    formData.set("confirmPassword", "a-new-secure-password");

    await expect(updatePassword({ error: null }, formData)).rejects.toThrow(
      "REDIRECT:/login?message=password-updated",
    );

    expect(updateUser).toHaveBeenCalledWith({ password: "a-new-secure-password" });
    expect(signOut).toHaveBeenCalledOnce();
    expect(mocks.cookieDelete).toHaveBeenCalledWith(recoveryVerifiedCookie);
  });
});
