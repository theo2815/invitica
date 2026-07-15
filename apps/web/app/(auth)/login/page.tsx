import type { Metadata } from "next";

import { AuthPage } from "../../../src/components/auth/AuthPage";
import { signInWithEmail, signInWithGoogle } from "../../../src/server/auth/actions";

export const metadata: Metadata = {
  title: "Sign in — Invitica",
  description: "Sign in to continue creating invitations with Invitica.",
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

const errorMessages: Record<string, string> = {
  confirmation:
    "We could not confirm that email link. Please try signing in or request a new link.",
  oauth: "We could not complete Google sign-in. Please try again.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const errorCode = typeof error === "string" ? error : undefined;

  return (
    <AuthPage
      emailAction={signInWithEmail}
      googleAction={signInWithGoogle}
      initialError={errorCode ? errorMessages[errorCode] : undefined}
      mode="login"
    />
  );
}
