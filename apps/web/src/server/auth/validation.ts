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
