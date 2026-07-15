import type { Metadata } from "next";

import { CheckEmailPage } from "../../../../src/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Confirm your email — Invitica",
  description: "Confirm your email address to finish creating your Invitica account.",
};

export default function RegisterCheckEmailPage() {
  return <CheckEmailPage />;
}
