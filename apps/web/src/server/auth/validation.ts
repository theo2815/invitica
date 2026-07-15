interface EmailCredentials {
  email: string;
  password: string;
}

interface RegistrationCredentials extends EmailCredentials {
  fullName: string;
}

type ValidationResult<T> = { data: T; ok: true } | { error: string; ok: false };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function validateEmailLogin(formData: FormData): ValidationResult<EmailCredentials> {
  const email = readString(formData, "email");
  const password = readString(formData, "password");

  if (!emailPattern.test(email) || password.length === 0) {
    return { error: "Enter a valid email address and password.", ok: false };
  }

  return { data: { email, password }, ok: true };
}

export function validateEmailRegistration(
  formData: FormData,
): ValidationResult<RegistrationCredentials> {
  const fullName = readString(formData, "fullName").replace(/\s+/g, " ");
  const email = readString(formData, "email");
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");

  if (fullName.length < 2 || fullName.length > 120) {
    return { error: "Enter your full name using 2 to 120 characters.", ok: false };
  }

  if (!emailPattern.test(email)) {
    return { error: "Enter a valid email address.", ok: false };
  }

  if (password.length < 8 || password.length > 128) {
    return { error: "Use a password between 8 and 128 characters.", ok: false };
  }

  if (password !== confirmPassword) {
    return { error: "The passwords do not match.", ok: false };
  }

  return { data: { email, fullName, password }, ok: true };
}
