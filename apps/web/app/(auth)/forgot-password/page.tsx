import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ForgotPasswordPage } from "../../../src/components/auth/PasswordRecoveryPage";
import { requestPasswordReset } from "../../../src/server/auth/actions";
import { publicAuthLocked } from "../../../src/server/auth/beta-gate";

export const metadata: Metadata = {
  title: "Reset your password — Invitica",
  description: "Request a private password-recovery code for your Invitica account.",
};

export default function ForgotPasswordRoute() {
  // Password recovery is closed while Invitica is in production beta; only development can use it.
  if (publicAuthLocked()) {
    redirect("/login?message=beta");
  }

  return <ForgotPasswordPage action={requestPasswordReset} />;
}
