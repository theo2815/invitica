/**
 * Cloudflare Turnstile sits in front of every Supabase Auth endpoint that accepts a token.
 *
 * **The verification happens at Supabase, not here.** Turnstile's secret key lives in the Supabase
 * Dashboard under Authentication → Attack Protection, and GoTrue calls Cloudflare's siteverify
 * itself. Invitica only carries the token from the browser to the client call, which is why this
 * module has no secret and no network call of its own.
 *
 * **The Dashboard toggle is project-wide, not per-endpoint.** Once *Enable CAPTCHA protection* is
 * on, sign-up, sign-in, password recovery, and OTP verification all demand a token together — so
 * every form that reaches one of them sends one, and the code ships before the toggle is turned on.
 * The reverse order signs every existing creator out until the next deploy.
 *
 * With no site key configured, `turnstileEnabled()` is false, the widget renders nothing, and the
 * forms behave exactly as they did before. That is the state a fresh clone and a local `pnpm dev`
 * start in.
 */

export const CAPTCHA_TOKEN_FIELD = "captchaToken";

export function turnstileSiteKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return key ? key : undefined;
}

export function turnstileEnabled(): boolean {
  return turnstileSiteKey() !== undefined;
}

export function readCaptchaToken(formData: FormData): string | undefined {
  const value = formData.get(CAPTCHA_TOKEN_FIELD);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Spread into a Supabase `options` object. The repository runs `exactOptionalPropertyTypes`, so an
 * absent token has to be an absent *key* — passing `captchaToken: undefined` is a type error, and
 * would also put a null into the request body for no reason.
 */
export function captchaOptions(token: string | undefined): { captchaToken?: string } {
  return token ? { captchaToken: token } : {};
}

/**
 * Supabase reports a refused or missing token as an ordinary auth error, so sign-in would otherwise
 * answer "The email or password is incorrect" for a challenge the creator never completed. The
 * provider's own wording — `captcha protection: request disallowed (missing-input-response)` — is
 * not something to show anyone, so match on it and write our own sentence.
 */
export function isCaptchaError(error: { message?: string } | null): boolean {
  return error?.message?.toLowerCase().includes("captcha") === true;
}

export const CAPTCHA_REFUSED_MESSAGE =
  "We could not confirm that you are a person. Complete the verification and try again.";
