import { describe, expect, it } from "vitest";

import { getSafeNextPath, getSiteOrigin } from "../src/server/auth/redirects";
import {
  validateEmailLogin,
  validateEmailRegistration,
  validatePasswordUpdate,
  validateRecoveryCode,
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
