import type { AuthFieldErrors } from "./types";

interface EmailCredentials {
  email: string;
  password: string;
}

interface RegistrationCredentials extends EmailCredentials {
  fullName: string;
  termsAccepted: boolean;
}

interface RecoveryCode {
  otp: string;
}

interface RecoveryEmail {
  email: string;
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

export function validateEmailLogin(formData: FormData): ValidationResult<EmailCredentials> {
  const email = readString(formData, "email");
  const password = readPassword(formData, "password");
  const fieldErrors: AuthFieldErrors = {};

  if (!email) {
    fieldErrors.email = "Enter your email address.";
  } else if (email.length > 254 || !emailPattern.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  if (!password) {
    fieldErrors.password = "Enter your password.";
  }

  if (hasErrors(fieldErrors)) {
    return { fieldErrors, ok: false };
  }

  return { data: { email, password }, ok: true };
}

export function validateEmailRegistration(
  formData: FormData,
  options: { requireTermsAcceptance?: boolean } = {},
): ValidationResult<RegistrationCredentials> {
  const fullName = readString(formData, "fullName").replace(/\s+/g, " ");
  const email = readString(formData, "email");
  const password = readPassword(formData, "password");
  const confirmPassword = readPassword(formData, "confirmPassword");
  const termsAccepted = formData.get("termsAccepted") === "yes";
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

  if (!password) {
    fieldErrors.password = "Create a password.";
  } else if (password.length < 8 || password.length > 128) {
    fieldErrors.password = "Use a password between 8 and 128 characters.";
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = "Re-enter your password.";
  } else if (password && password !== confirmPassword) {
    fieldErrors.confirmPassword = "Your passwords do not match.";
  }

  if (options.requireTermsAcceptance && !termsAccepted) {
    fieldErrors.termsAccepted = "Agree to the current Terms of Service to continue.";
  }

  if (hasErrors(fieldErrors)) {
    return { fieldErrors, ok: false };
  }

  return { data: { email, fullName, password, termsAccepted }, ok: true };
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

export function validateRecoveryEmail(formData: FormData): ValidationResult<RecoveryEmail> {
  const email = readString(formData, "email");

  if (!email) {
    return { fieldErrors: { email: "Enter your email address." }, ok: false };
  }

  if (email.length > 254 || !emailPattern.test(email)) {
    return { fieldErrors: { email: "Enter a valid email address." }, ok: false };
  }

  return { data: { email }, ok: true };
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
export function validateRecoveryCode(formData: FormData): ValidationResult<RecoveryCode> {
  const otp = readString(formData, "otp").replace(/\s/g, "");

  if (!/^\d{6}$/.test(otp)) {
    return {
      fieldErrors: { otp: "Enter the 6-digit code from your email." },
      ok: false,
    };
  }

  return { data: { otp }, ok: true };
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
): ValidationResult<{ currentPassword: string; password: string }> {
  const currentPassword = readPassword(formData, "currentPassword");
  const password = readPassword(formData, "password");
  const confirmPassword = readPassword(formData, "confirmPassword");
  const fieldErrors: AuthFieldErrors = {};

  if (!currentPassword) {
    fieldErrors.currentPassword = "Enter your current password.";
  }

  if (!password) {
    fieldErrors.password = "Create a new password.";
  } else if (password.length < 8 || password.length > 128) {
    fieldErrors.password = "Use a password between 8 and 128 characters.";
  } else if (currentPassword && password === currentPassword) {
    fieldErrors.password = "Choose a password different from your current one.";
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

export function validatePasswordUpdate(formData: FormData): ValidationResult<{ password: string }> {
  const password = readPassword(formData, "password");
  const confirmPassword = readPassword(formData, "confirmPassword");
  const fieldErrors: AuthFieldErrors = {};

  if (!password) {
    fieldErrors.password = "Create a new password.";
  } else if (password.length < 8 || password.length > 128) {
    fieldErrors.password = "Use a password between 8 and 128 characters.";
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
