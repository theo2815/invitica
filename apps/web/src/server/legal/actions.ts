"use server";

import { isLegalAcceptanceEnabled } from "@invitica/renderer/legal-documents";
import { redirect } from "next/navigation";
import { getSafeNextPath } from "../auth/redirects";
import { requireConfirmedUser } from "../auth/session";
import type { AuthActionState } from "../auth/types";
import { validateTermsAcceptance } from "../auth/validation";
import { recordCurrentTermsAcceptance } from "./acceptance";

export async function acceptCurrentTerms(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isLegalAcceptanceEnabled()) {
    return { error: "Terms acceptance is unavailable while the documents are under review." };
  }

  const result = validateTermsAcceptance(formData);
  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  const nextValue = formData.get("next");
  const nextPath = getSafeNextPath(typeof nextValue === "string" ? nextValue : null);
  const { supabase, user } = await requireConfirmedUser({
    allowMissingLegalAcceptance: true,
  });
  const acceptance = await recordCurrentTermsAcceptance(supabase, user.id);

  if (acceptance.error) {
    return { error: "We could not record your acceptance. Please wait a moment and try again." };
  }

  redirect(nextPath);
}
