import type { Metadata } from "next";

import { AuthPage } from "../../../src/components/auth/AuthPage";
import { signInWithGoogle, signUpWithEmail } from "../../../src/server/auth/actions";

export const metadata: Metadata = {
  title: "Create an account — Invitica",
  description: "Create your Invitica account and begin a beautiful invitation.",
};

export default function RegisterPage() {
  return <AuthPage emailAction={signUpWithEmail} googleAction={signInWithGoogle} mode="register" />;
}
