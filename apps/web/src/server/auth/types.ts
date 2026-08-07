export type AuthFieldName =
  | "confirmPassword"
  // Settings re-verifies the password a creator already has before changing it, which is
  // the one credential form with two password fields that mean different things.
  | "currentPassword"
  | "email"
  | "fullName"
  | "otp"
  | "password"
  | "termsAccepted";

export type AuthFieldErrors = Partial<Record<AuthFieldName, string>>;

export interface AuthActionState {
  error: string | null;
  fieldErrors?: AuthFieldErrors;
  notice?: string | null;
}
