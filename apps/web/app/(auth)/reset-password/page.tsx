import type { Metadata } from "next";

import { ResetPasswordPage } from "../../../src/components/auth/PasswordRecoveryPage";
import { updatePassword } from "../../../src/server/auth/actions";

export const metadata: Metadata = {
  title: "Choose a new password — Invitica",
  description: "Choose a new password for your verified Invitica account.",
};

export default function ResetPasswordRoute() {
  return <ResetPasswordPage action={updatePassword} />;
}
