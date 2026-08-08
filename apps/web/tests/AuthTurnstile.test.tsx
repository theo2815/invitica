import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthPage } from "../src/components/auth/AuthPage";
import {
  CAPTCHA_TOKEN_FIELD,
  captchaOptions,
  isCaptchaError,
  readCaptchaToken,
  turnstileEnabled,
} from "../src/server/auth/turnstile";
import { validateEmailLogin, validateRecoveryCode } from "../src/server/auth/validation";

const emailAction = vi.fn(async () => ({ error: null }));
const googleAction = vi.fn(async () => {});

afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});

describe("turnstile configuration", () => {
  it("is off without a site key, and a blank key does not count", () => {
    expect(turnstileEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "   ";
    expect(turnstileEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    expect(turnstileEnabled()).toBe(true);
  });

  it("reads a token from form data and ignores an empty one", () => {
    const formData = new FormData();
    expect(readCaptchaToken(formData)).toBeUndefined();

    formData.set(CAPTCHA_TOKEN_FIELD, "");
    expect(readCaptchaToken(formData)).toBeUndefined();

    formData.set(CAPTCHA_TOKEN_FIELD, "0.abc");
    expect(readCaptchaToken(formData)).toBe("0.abc");
  });

  it("omits the key entirely rather than passing undefined", () => {
    // `exactOptionalPropertyTypes` makes this a type rule as well as a wire one.
    expect(captchaOptions(undefined)).toEqual({});
    expect(Object.hasOwn(captchaOptions(undefined), "captchaToken")).toBe(false);
    expect(captchaOptions("0.abc")).toEqual({ captchaToken: "0.abc" });
  });

  it("recognises the provider's refusal so it is not reported as a wrong password", () => {
    expect(
      isCaptchaError({
        message: "captcha protection: request disallowed (missing-input-response)",
      }),
    ).toBe(true);
    expect(isCaptchaError({ message: "Invalid login credentials" })).toBe(false);
    expect(isCaptchaError(null)).toBe(false);
  });
});

describe("validators demand a token only when one is required", () => {
  function login(extra: Record<string, string> = {}) {
    const formData = new FormData();
    formData.set("email", "maria@example.invalid");
    formData.set("password", "a-password-that-exists");
    for (const [key, value] of Object.entries(extra)) formData.set(key, value);
    return formData;
  }

  it("accepts a form with no token when Turnstile is not configured", () => {
    const result = validateEmailLogin(login());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.captchaToken).toBeUndefined();
  });

  it("refuses a missing token when it is required", () => {
    const result = validateEmailLogin(login(), { requireCaptcha: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.captchaToken).toBe("Complete the verification below to continue.");
    }
  });

  it("carries the token through when present", () => {
    const result = validateEmailLogin(login({ [CAPTCHA_TOKEN_FIELD]: "0.abc" }), {
      requireCaptcha: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.captchaToken).toBe("0.abc");
  });

  it("reports a bad code and a missing token together on the verify form", () => {
    const formData = new FormData();
    formData.set("otp", "12ab56");

    const result = validateRecoveryCode(formData, { requireCaptcha: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.otp).toBeDefined();
      expect(result.fieldErrors.captchaToken).toBeDefined();
    }
  });
});

describe("the widget renders only when configured", () => {
  beforeEach(() => {
    // jsdom has no Cloudflare script; the container and hidden input are what these assert.
    vi.stubGlobal("scrollTo", vi.fn());
  });

  it("renders nothing at all with no site key", () => {
    const { container } = render(
      <AuthPage emailAction={emailAction} googleAction={googleAction} mode="login" />,
    );

    expect(container.querySelector(`input[name="${CAPTCHA_TOKEN_FIELD}"]`)).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
  });

  it("renders the container and an empty token input once a key is set", () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

    const { container } = render(
      <AuthPage emailAction={emailAction} googleAction={googleAction} mode="login" />,
    );

    const input = container.querySelector<HTMLInputElement>(`input[name="${CAPTCHA_TOKEN_FIELD}"]`);
    expect(input).not.toBeNull();
    // Empty until Cloudflare answers, which is what makes the validator refuse the submission.
    expect(input?.value).toBe("");
  });
});
