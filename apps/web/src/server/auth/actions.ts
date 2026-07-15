"use server";

import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { getSiteOrigin } from "./redirects";
import { ensurePersonalWorkspace } from "./session";
import type { AuthActionState } from "./types";
import { validateEmailLogin, validateEmailRegistration } from "./validation";

export async function signInWithEmail(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = validateEmailLogin(formData);

  if (!result.ok) {
    return { error: result.error };
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
    return { error: result.error };
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
