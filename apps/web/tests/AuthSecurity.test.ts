import { describe, expect, it } from "vitest";

import { getSafeNextPath, getSiteOrigin } from "../src/server/auth/redirects";
import { validateEmailLogin, validateEmailRegistration } from "../src/server/auth/validation";

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
      error: "Enter a valid email address and password.",
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
      error: "The passwords do not match.",
      ok: false,
    });
  });
});
