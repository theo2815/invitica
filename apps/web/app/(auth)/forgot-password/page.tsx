import type { Metadata } from "next";

import { ForgotPasswordPage } from "../../../src/components/auth/PasswordRecoveryPage";
import { requestPasswordReset } from "../../../src/server/auth/actions";

export const metadata: Metadata = {
  title: "Reset your password — Invitica",
  description: "Request a private password-recovery code for your Invitica account.",
};

export default function ForgotPasswordRoute() {
  return <ForgotPasswordPage action={requestPasswordReset} />;
}
