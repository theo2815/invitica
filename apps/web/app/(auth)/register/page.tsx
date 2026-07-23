import type { Metadata } from "next";

import { AuthPage } from "../../../src/components/auth/AuthPage";
import { signInWithGoogle, signUpWithEmail } from "../../../src/server/auth/actions";
import { getSafeNextPath } from "../../../src/server/auth/redirects";

export const metadata: Metadata = {
  title: "Create an account — Invitica",
  description: "Create your Invitica account and begin a beautiful invitation.",
};

interface RegisterPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { next } = await searchParams;
  const nextPath = getSafeNextPath(typeof next === "string" ? next : null);

  return (
    <AuthPage
      emailAction={signUpWithEmail}
      googleAction={signInWithGoogle}
      mode="register"
      nextPath={nextPath === "/dashboard" ? undefined : nextPath}
    />
  );
}
