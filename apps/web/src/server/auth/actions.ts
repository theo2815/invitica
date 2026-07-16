"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { getSiteOrigin } from "./redirects";
import { ensurePersonalWorkspace } from "./session";
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
  const result = validateEmailLogin(formData);

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(result.data);

  if (error) {
    return { error: "The email or password is incorrect." };
  }

  const workspace = await ensurePersonalWorkspace();
  if (workspace.error) {
    return { error: "Your account is signed in, but its workspace could not be prepared." };
  }

  redirect("/dashboard");
}

export async function signUpWithEmail(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = validateEmailRegistration(formData);

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  const supabase = await createClient();
  const origin = getSiteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: result.data.email,
    password: result.data.password,
    options: {
      data: { full_name: result.data.fullName },
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    return { error: "Your account could not be created. Please try again." };
  }

  if (data.session) {
    const workspace = await ensurePersonalWorkspace();
    if (workspace.error) {
      return { error: "Your account was created, but its workspace could not be prepared." };
    }
    redirect("/dashboard");
  }

  redirect("/register/check-email");
}

export async function signInWithGoogle(_formData: FormData): Promise<void> {
  const supabase = await createClient();
  const origin = getSiteOrigin();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/dashboard")}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth");
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
  const result = validateRecoveryEmail(formData);

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  const supabase = await createClient();
  const origin = getSiteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(result.data.email, {
    redirectTo: `${origin}/reset-password`,
  });

  if (error) {
    return {
      error: "We could not send a recovery code right now. Please wait a moment and try again.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(recoveryEmailCookie, result.data.email, recoveryCookieOptions());
  redirect("/forgot-password/verify");
}

export async function resendRecoveryCode(
  _state: AuthActionState,
  _formData: FormData,
): Promise<AuthActionState> {
  const cookieStore = await cookies();
  const email = cookieStore.get(recoveryEmailCookie)?.value;

  if (!email) {
    return {
      error: "Your recovery request has expired. Start again with your email address.",
    };
  }

  const supabase = await createClient();
  const origin = getSiteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  if (error) {
    return {
      error: "We could not resend the code right now. Please wait a moment and try again.",
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
  const result = validateRecoveryCode(formData);

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
    token: result.data.otp,
    type: "recovery",
  });

  if (error) {
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
