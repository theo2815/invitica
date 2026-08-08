"use server";

import { isLegalAcceptanceEnabled } from "@invitica/renderer/legal-documents";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import {
  buildLegalAcceptancePath,
  getPostAuthLegalRedirect,
  recordCurrentTermsAcceptance,
  setPendingTermsAcceptance,
} from "../legal/acceptance";
import { legalAcceptanceCookieSecretIsConfigured } from "../legal/pending-acceptance";
import { getSafeNextPath, getSiteOrigin } from "./redirects";
import {
  CAPTCHA_REFUSED_MESSAGE,
  captchaOptions,
  isCaptchaError,
  readCaptchaToken,
  turnstileEnabled,
} from "./turnstile";
import type { AuthActionState } from "./types";
import {
  validateEmailLogin,
  validateEmailRegistration,
  validatePasswordUpdate,
  validateRecoveryCode,
  validateRecoveryEmail,
} from "./validation";

const recoveryEmailCookie = "invitica-recovery-email";
const recoveryVerifiedCookie = "invitica-recovery-verified";
const recoveryCookieMaxAge = 15 * 60;

function recoveryCookieOptions() {
  return {
    httpOnly: true,
    maxAge: recoveryCookieMaxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function signInWithEmail(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const nextValue = formData.get("next");
  const nextPath = getSafeNextPath(typeof nextValue === "string" ? nextValue : null);
  const result = validateEmailLogin(formData, { requireCaptcha: turnstileEnabled() });

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  const supabase = await createClient();
  const { captchaToken, email, password } = result.data;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    options: captchaOptions(captchaToken),
    password,
  });

  if (error || !data.user) {
    // A refused challenge is not a wrong password, and saying so would send a creator off to reset
    // a password that was correct.
    return {
      error: isCaptchaError(error)
        ? CAPTCHA_REFUSED_MESSAGE
        : "The email or password is incorrect.",
    };
  }

  const acceptanceRedirect = await getPostAuthLegalRedirect(supabase, data.user.id, nextPath);
  if (acceptanceRedirect) {
    redirect(acceptanceRedirect);
  }

  const { error: workspaceError } = await supabase.rpc("ensure_personal_workspace");
  if (workspaceError) {
    return { error: "Your account is signed in, but its workspace could not be prepared." };
  }

  redirect(nextPath);
}

export async function signUpWithEmail(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const nextValue = formData.get("next");
  const nextPath = getSafeNextPath(typeof nextValue === "string" ? nextValue : null);
  const result = validateEmailRegistration(formData, {
    requireCaptcha: turnstileEnabled(),
    requireTermsAcceptance: isLegalAcceptanceEnabled(),
  });

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  if (isLegalAcceptanceEnabled() && !legalAcceptanceCookieSecretIsConfigured()) {
    return {
      error: "Account creation is temporarily unavailable while legal acceptance is configured.",
    };
  }

  const supabase = await createClient();
  const origin = getSiteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: result.data.email,
    password: result.data.password,
    options: {
      ...captchaOptions(result.data.captchaToken),
      data: { full_name: result.data.fullName },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    return {
      error: isCaptchaError(error)
        ? CAPTCHA_REFUSED_MESSAGE
        : "Your account could not be created. Please try again.",
    };
  }

  if (data.session) {
    if (isLegalAcceptanceEnabled() && data.user) {
      const acceptance = await recordCurrentTermsAcceptance(supabase, data.user.id);
      if (acceptance.error) {
        redirect(buildLegalAcceptancePath(nextPath));
      }
    }

    const { error: workspaceError } = await supabase.rpc("ensure_personal_workspace");
    if (workspaceError) {
      return { error: "Your account was created, but its workspace could not be prepared." };
    }

    redirect(nextPath);
  }

  await setPendingTermsAcceptance();

  redirect("/register/check-email");
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  // No captcha token here. The OAuth redirect is not a credential endpoint, and Google runs its own
  // abuse controls on the consent screen the creator lands on.
  const supabase = await createClient();
  const origin = getSiteOrigin();
  const nextValue = formData.get("next");
  const nextPath = getSafeNextPath(typeof nextValue === "string" ? nextValue : null);
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data.url) {
    redirect(`/login?error=oauth&next=${encodeURIComponent(nextPath)}`);
  }

  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = validateRecoveryEmail(formData, { requireCaptcha: turnstileEnabled() });

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  const supabase = await createClient();
  const origin = getSiteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(result.data.email, {
    ...captchaOptions(result.data.captchaToken),
    redirectTo: `${origin}/reset-password`,
  });

  if (error) {
    return {
      error: isCaptchaError(error)
        ? CAPTCHA_REFUSED_MESSAGE
        : "We could not send a recovery code right now. Please wait a moment and try again.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(recoveryEmailCookie, result.data.email, recoveryCookieOptions());
  redirect("/forgot-password/verify");
}

export async function resendRecoveryCode(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const cookieStore = await cookies();
  const email = cookieStore.get(recoveryEmailCookie)?.value;

  if (!email) {
    return {
      error: "Your recovery request has expired. Start again with your email address.",
    };
  }

  // The address comes from the cookie, never the form, so this action has no field to validate —
  // only the shared challenge the verify page's other form also carries.
  const captchaToken = readCaptchaToken(formData);
  if (turnstileEnabled() && !captchaToken) {
    return { error: CAPTCHA_REFUSED_MESSAGE };
  }

  const supabase = await createClient();
  const origin = getSiteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    ...captchaOptions(captchaToken),
    redirectTo: `${origin}/reset-password`,
  });

  if (error) {
    return {
      error: isCaptchaError(error)
        ? CAPTCHA_REFUSED_MESSAGE
        : "We could not resend the code right now. Please wait a moment and try again.",
    };
  }

  cookieStore.set(recoveryEmailCookie, email, recoveryCookieOptions());
  return {
    error: null,
    notice: "A new recovery code is on its way. Use the most recent email we sent.",
  };
}

export async function verifyRecoveryCode(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = validateRecoveryCode(formData, { requireCaptcha: turnstileEnabled() });

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  const cookieStore = await cookies();
  const email = cookieStore.get(recoveryEmailCookie)?.value;

  if (!email) {
    return {
      error: "Your recovery request has expired. Start again with your email address.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    options: captchaOptions(result.data.captchaToken),
    token: result.data.otp,
    type: "recovery",
  });

  if (error) {
    if (isCaptchaError(error)) {
      return { error: null, fieldErrors: { captchaToken: CAPTCHA_REFUSED_MESSAGE } };
    }

    return {
      error: null,
      fieldErrors: {
        otp: "That recovery code is incorrect or has expired. Request a new code and try again.",
      },
    };
  }

  cookieStore.delete(recoveryEmailCookie);
  cookieStore.set(recoveryVerifiedCookie, "verified", recoveryCookieOptions());
  redirect("/reset-password");
}

export async function updatePassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = validatePasswordUpdate(formData);

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  const cookieStore = await cookies();
  if (cookieStore.get(recoveryVerifiedCookie)?.value !== "verified") {
    return {
      error: "Your recovery session has expired. Request a new code to change your password.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "Your recovery session has expired. Request a new code to change your password.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: result.data.password });

  if (error) {
    return {
      error: "Your password could not be changed. Please try again.",
    };
  }

  await supabase.auth.signOut();
  cookieStore.delete(recoveryVerifiedCookie);
  redirect("/login?message=password-updated");
}
