export type AuthFieldName = "confirmPassword" | "email" | "fullName" | "otp" | "password";

export type AuthFieldErrors = Partial<Record<AuthFieldName, string>>;

export interface AuthActionState {
  error: string | null;
  fieldErrors?: AuthFieldErrors;
  notice?: string | null;
}
