import { assessPassword, type PasswordContext } from "./password-strength";
import type { AuthFieldErrors } from "./types";

interface EmailCredentials {
  captchaToken: string | undefined;
  email: string;
  password: string;
}

interface RegistrationCredentials extends EmailCredentials {
  fullName: string;
  termsAccepted: boolean;
}

interface RecoveryCode {
  captchaToken: string | undefined;
  otp: string;
}

interface RecoveryEmail {
  captchaToken: string | undefined;
  email: string;
}

/**
 * `requireCaptcha` is false wherever no Turnstile site key is configured — a fresh clone, a local
 * `pnpm dev`, and any environment where the Supabase toggle has not been turned on yet. The forms
 * then behave exactly as they did before Turnstile existed.
 */
interface CaptchaOption {
  requireCaptcha?: boolean;
}

type ValidationResult<T> = { data: T; ok: true } | { fieldErrors: AuthFieldErrors; ok: false };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readPassword(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function hasErrors(fieldErrors: AuthFieldErrors): boolean {
  return Object.keys(fieldErrors).length > 0;
}

/**
 * The one place a password being *set* is judged, so the meter a creator watches and the refusal
 * they receive come from the same function. Sign-in never calls it: an existing password predates
 * the rule and is not the sign-in form's business.
 */
function passwordProblem(
  password: string,
  context: PasswordContext = {},
  emptyMessage = "Create a password.",
): string | undefined {
  if (!password) {
    return emptyMessage;
  }
  return assessPassword(password, context).problem;
}

/**
 * Turnstile's token. The presence check is ours; the token itself is verified by Supabase, which
 * holds the secret half — so a forged value fails at the provider, not here.
 */
function readCaptchaToken(formData: FormData): string | undefined {
  const value = formData.get("captchaToken");
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function captchaError(token: string | undefined, required: boolean): string | undefined {
  return required && !token ? "Complete the verification below to continue." : undefined;
}

/**
 * Sign-in deliberately does **not** score the password. It predates the 2026-08-08 rule, and
 * refusing a correct password at the sign-in form would lock a creator out of the account they
 * would need to change it from.
 */
export function validateEmailLogin(
  formData: FormData,
  options: CaptchaOption = {},
): ValidationResult<EmailCredentials> {
  const email = readString(formData, "email");
  const password = readPassword(formData, "password");
  const captchaToken = readCaptchaToken(formData);
  const fieldErrors: AuthFieldErrors = {};

  if (!email) {
    fieldErrors.email = "Enter your email address.";
  } else if (email.length > 254 || !emailPattern.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  if (!password) {
    fieldErrors.password = "Enter your password.";
  }

  const captcha = captchaError(captchaToken, options.requireCaptcha === true);
  if (captcha) {
    fieldErrors.captchaToken = captcha;
  }

  if (hasErrors(fieldErrors)) {
    return { fieldErrors, ok: false };
  }

  return { data: { captchaToken, email, password }, ok: true };
}

export function validateEmailRegistration(
  formData: FormData,
  options: CaptchaOption & { requireTermsAcceptance?: boolean } = {},
): ValidationResult<RegistrationCredentials> {
  const fullName = readString(formData, "fullName").replace(/\s+/g, " ");
  const email = readString(formData, "email");
  const password = readPassword(formData, "password");
  const confirmPassword = readPassword(formData, "confirmPassword");
  const termsAccepted = formData.get("termsAccepted") === "yes";
  const captchaToken = readCaptchaToken(formData);
  const fieldErrors: AuthFieldErrors = {};

  if (!fullName) {
    fieldErrors.fullName = "Enter your full name.";
  } else if (fullName.length < 2 || fullName.length > 120) {
    fieldErrors.fullName = "Use 2 to 120 characters for your full name.";
  }

  if (!email) {
    fieldErrors.email = "Enter your email address.";
  } else if (email.length > 254 || !emailPattern.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  // The name and email are passed in so the same password cannot be both. They are read from this
  // form rather than the account, so a creator gets the answer before the round trip.
  const passwordIssue = passwordProblem(password, { email, fullName });
  if (passwordIssue) {
    fieldErrors.password = passwordIssue;
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = "Re-enter your password.";
  } else if (password && password !== confirmPassword) {
    fieldErrors.confirmPassword = "Your passwords do not match.";
  }

  if (options.requireTermsAcceptance && !termsAccepted) {
    fieldErrors.termsAccepted = "Agree to the current Terms of Service to continue.";
  }

  const captcha = captchaError(captchaToken, options.requireCaptcha === true);
  if (captcha) {
    fieldErrors.captchaToken = captcha;
  }

  if (hasErrors(fieldErrors)) {
    return { fieldErrors, ok: false };
  }

  return { data: { captchaToken, email, fullName, password, termsAccepted }, ok: true };
}

export function validateTermsAcceptance(
  formData: FormData,
): ValidationResult<{ termsAccepted: true }> {
  if (formData.get("termsAccepted") !== "yes") {
    return {
      fieldErrors: { termsAccepted: "Agree to the current Terms of Service to continue." },
      ok: false,
    };
  }

  return { data: { termsAccepted: true }, ok: true };
}

export function validateRecoveryEmail(
  formData: FormData,
  options: CaptchaOption = {},
): ValidationResult<RecoveryEmail> {
  const email = readString(formData, "email");
  const captchaToken = readCaptchaToken(formData);
  const fieldErrors: AuthFieldErrors = {};

  if (!email) {
    fieldErrors.email = "Enter your email address.";
  } else if (email.length > 254 || !emailPattern.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  const captcha = captchaError(captchaToken, options.requireCaptcha === true);
  if (captcha) {
    fieldErrors.captchaToken = captcha;
  }

  if (hasErrors(fieldErrors)) {
    return { fieldErrors, ok: false };
  }

  return { data: { captchaToken, email }, ok: true };
}

/**
 * **Coupled to a Supabase setting this code cannot read.**
 *
 * The length below must equal **Authentication → Emails → Email OTP Length** in the Supabase
 * Dashboard. That value is configurable from 6 to 10, and on 2026-08-07 it was found set to **8**,
 * which broke password recovery outright: an eight-digit code failed this regex, and
 * `PasswordRecoveryPage`'s `maxLength={6}` meant it could not even be typed in full.
 *
 * Six is the intended length and the setting is correct as of 2026-08-07. Six places encode it —
 * this regex, its error string, and the recovery page's `maxLength`, `slice(0, 6)`, `pattern`, and
 * "six-digit" description — so the fix for a mismatch is the Dashboard setting, not these.
 */
export function validateRecoveryCode(
  formData: FormData,
  options: CaptchaOption = {},
): ValidationResult<RecoveryCode> {
  const otp = readString(formData, "otp").replace(/\s/g, "");
  const captchaToken = readCaptchaToken(formData);
  const fieldErrors: AuthFieldErrors = {};

  if (!/^\d{6}$/.test(otp)) {
    fieldErrors.otp = "Enter the 6-digit code from your email.";
  }

  const captcha = captchaError(captchaToken, options.requireCaptcha === true);
  if (captcha) {
    fieldErrors.captchaToken = captcha;
  }

  if (hasErrors(fieldErrors)) {
    return { fieldErrors, ok: false };
  }

  return { data: { captchaToken, otp }, ok: true };
}

/**
 * The settings panels below manage an account that already exists, so they live beside the
 * credential validators above rather than in their own module — one email pattern, one set
 * of password bounds, one place to change either.
 */

export function validateCreatorName(formData: FormData): ValidationResult<{ fullName: string }> {
  const fullName = readString(formData, "fullName").replace(/\s+/g, " ");

  if (!fullName) {
    return { fieldErrors: { fullName: "Enter your name." }, ok: false };
  }

  // The same 2-120 bound registration uses. A creator who registered with a name this
  // rejects could not have registered at all.
  if (fullName.length < 2 || fullName.length > 120) {
    return { fieldErrors: { fullName: "Use 2 to 120 characters for your name." }, ok: false };
  }

  return { data: { fullName }, ok: true };
}

/**
 * Unlike `validatePasswordUpdate`, which trusts a verified recovery code, this one carries the
 * creator's current password so the action can prove the session belongs to someone who knows
 * it. A stolen laptop with a live session must not be enough to change the password on it.
 */
export function validatePasswordChange(
  formData: FormData,
  context: PasswordContext = {},
): ValidationResult<{ currentPassword: string; password: string }> {
  const currentPassword = readPassword(formData, "currentPassword");
  const password = readPassword(formData, "password");
  const confirmPassword = readPassword(formData, "confirmPassword");
  const fieldErrors: AuthFieldErrors = {};

  if (!currentPassword) {
    fieldErrors.currentPassword = "Enter your current password.";
  }

  if (currentPassword && password === currentPassword) {
    fieldErrors.password = "Choose a password different from your current one.";
  } else {
    const passwordIssue = passwordProblem(password, context, "Create a new password.");
    if (passwordIssue) {
      fieldErrors.password = passwordIssue;
    }
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = "Re-enter your new password.";
  } else if (password && password !== confirmPassword) {
    fieldErrors.confirmPassword = "Your passwords do not match.";
  }

  if (hasErrors(fieldErrors)) {
    return { fieldErrors, ok: false };
  }

  return { data: { currentPassword, password }, ok: true };
}

export function validateEmailChange(
  formData: FormData,
  currentEmail: string | undefined,
): ValidationResult<{ email: string }> {
  const email = readString(formData, "email");

  if (!email) {
    return { fieldErrors: { email: "Enter your new email address." }, ok: false };
  }

  if (email.length > 254 || !emailPattern.test(email)) {
    return { fieldErrors: { email: "Enter a valid email address." }, ok: false };
  }

  // Supabase accepts the unchanged address and sends a confirmation for it, which reads as
  // a pending change that never resolves into anything.
  if (currentEmail && email.toLowerCase() === currentEmail.toLowerCase()) {
    return {
      fieldErrors: { email: "This is already your email address." },
      ok: false,
    };
  }

  return { data: { email }, ok: true };
}

export function validatePasswordUpdate(
  formData: FormData,
  context: PasswordContext = {},
): ValidationResult<{ password: string }> {
  const password = readPassword(formData, "password");
  const confirmPassword = readPassword(formData, "confirmPassword");
  const fieldErrors: AuthFieldErrors = {};

  const passwordIssue = passwordProblem(password, context, "Create a new password.");
  if (passwordIssue) {
    fieldErrors.password = passwordIssue;
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = "Re-enter your new password.";
  } else if (password && password !== confirmPassword) {
    fieldErrors.confirmPassword = "Your passwords do not match.";
  }

  if (hasErrors(fieldErrors)) {
    return { fieldErrors, ok: false };
  }

  return { data: { password }, ok: true };
}
