import type { Metadata } from "next";

import { VerifyRecoveryPage } from "../../../../src/components/auth/PasswordRecoveryPage";
import { resendRecoveryCode, verifyRecoveryCode } from "../../../../src/server/auth/actions";

export const metadata: Metadata = {
  title: "Verify your recovery code — Invitica",
  description: "Verify the private recovery code sent to your email address.",
};

export default function VerifyRecoveryRoute() {
  return <VerifyRecoveryPage action={verifyRecoveryCode} resendAction={resendRecoveryCode} />;
}
