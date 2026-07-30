export type AuthFieldName =
  | "confirmPassword"
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
