import { describe, expect, it } from "vitest";

import { getSafeNextPath, getSiteOrigin } from "../src/server/auth/redirects";
import {
  validateEmailLogin,
  validateEmailRegistration,
  validatePasswordUpdate,
  validateRecoveryCode,
  validateTermsAcceptance,
} from "../src/server/auth/validation";

describe("authentication security helpers", () => {
  it("accepts only same-origin relative return paths", () => {
    expect(getSafeNextPath("/dashboard?view=recent")).toBe("/dashboard?view=recent");
    expect(getSafeNextPath("https://example.com/steal")).toBe("/dashboard");
    expect(getSafeNextPath("//example.com/steal")).toBe("/dashboard");
    expect(getSafeNextPath("/\\example.com")).toBe("/dashboard");
  });

  it("accepts only an explicit HTTP or HTTPS site origin", () => {
    expect(getSiteOrigin("https://invitica.example")).toBe("https://invitica.example");
    expect(() => getSiteOrigin("https://invitica.example/auth/callback")).toThrow();
    expect(() => getSiteOrigin("javascript:alert(1)")).toThrow();
  });

  /**
   * A hosted `http://` value does not fail loudly — it breaks Google sign-in silently. The OAuth
   * `redirectTo` is built from this origin and Supabase matches it against its Redirect URLs
   * allowlist scheme and all, so `http://` misses, GoTrue falls back to the project's Site URL, and
   * the creator lands on the landing page holding an unused `?code=`. Observed on invitica.app on
   * 2026-08-08, where `/auth/callback` was redirecting to `http://invitica.app/login?error=oauth`.
   */
  it("upgrades a remote http site origin to https, and leaves local development alone", () => {
    expect(getSiteOrigin("http://invitica.example")).toBe("https://invitica.example");
    expect(getSiteOrigin("http://invitica.app")).toBe("https://invitica.app");

    expect(getSiteOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(getSiteOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  it("rejects incomplete login credentials", () => {
    const formData = new FormData();
    formData.set("email", "not-an-email");

    expect(validateEmailLogin(formData)).toEqual({
      fieldErrors: {
        email: "Enter a valid email address.",
        password: "Enter your password.",
      },
      ok: false,
    });
  });

  it("requires matching registration passwords", () => {
    const formData = new FormData();
    formData.set("fullName", "Maria Santos");
    formData.set("email", "maria@example.com");
    formData.set("password", "a-secure-password");
    formData.set("confirmPassword", "a-different-password");

    expect(validateEmailRegistration(formData)).toEqual({
      fieldErrors: { confirmPassword: "Your passwords do not match." },
      ok: false,
    });
  });

  it("requires an explicit Terms value when legal acceptance is enabled", () => {
    const formData = new FormData();
    formData.set("fullName", "Maria Santos");
    formData.set("email", "maria@example.com");
    formData.set("password", "a-secure-password");
    formData.set("confirmPassword", "a-secure-password");

    expect(validateEmailRegistration(formData, { requireTermsAcceptance: true })).toEqual({
      fieldErrors: { termsAccepted: "Agree to the current Terms of Service to continue." },
      ok: false,
    });
    expect(validateTermsAcceptance(formData).ok).toBe(false);

    formData.set("termsAccepted", "yes");
    expect(validateTermsAcceptance(formData)).toEqual({
      data: { termsAccepted: true },
      ok: true,
    });
  });

  it("validates recovery codes without accepting non-numeric tokens", () => {
    const formData = new FormData();
    formData.set("otp", "12ab56");

    expect(validateRecoveryCode(formData)).toEqual({
      fieldErrors: { otp: "Enter the 6-digit code from your email." },
      ok: false,
    });
  });

  it("requires matching new passwords", () => {
    const formData = new FormData();
    formData.set("password", "a-new-secure-password");
    formData.set("confirmPassword", "a-different-password");

    expect(validatePasswordUpdate(formData)).toEqual({
      fieldErrors: { confirmPassword: "Your passwords do not match." },
      ok: false,
    });
  });
});
