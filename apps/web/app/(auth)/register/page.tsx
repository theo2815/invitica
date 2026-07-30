import { isLegalAcceptanceEnabled } from "@invitica/renderer/legal-documents";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPage } from "../../../src/components/auth/AuthPage";
import { signInWithGoogle, signUpWithEmail } from "../../../src/server/auth/actions";
import { publicAuthLocked } from "../../../src/server/auth/beta-gate";
import { getSafeNextPath } from "../../../src/server/auth/redirects";

export const metadata: Metadata = {
  title: "Create an account — Invitica",
  description: "Create your Invitica account and begin a beautiful invitation.",
};

interface RegisterPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  // Account creation is closed while Invitica is in production beta; only development can register.
  if (publicAuthLocked()) {
    redirect("/login?message=beta");
  }

  const { next } = await searchParams;
  const nextPath = getSafeNextPath(typeof next === "string" ? next : null);

  return (
    <AuthPage
      emailAction={signUpWithEmail}
      googleAction={signInWithGoogle}
      legalAcceptanceRequired={isLegalAcceptanceEnabled()}
      mode="register"
      nextPath={nextPath === "/dashboard" ? undefined : nextPath}
    />
  );
}
