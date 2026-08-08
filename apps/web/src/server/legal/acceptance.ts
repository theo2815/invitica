import {
  isLegalAcceptanceEnabled,
  LEGAL_DOCUMENTS,
  type LegalDocumentSet,
} from "@invitica/renderer/legal-documents";
import { cookies } from "next/headers";

import type { createClient } from "../../lib/supabase/server";
import { getSafeNextPath } from "../auth/redirects";
import {
  createPendingAcceptanceToken,
  pendingAcceptanceMaxAgeSeconds,
  verifyPendingAcceptanceToken,
} from "./pending-acceptance";

type InviticaSupabaseClient = Awaited<ReturnType<typeof createClient>>;

const pendingAcceptanceCookie = "invitica-pending-terms-acceptance";

export function buildLegalAcceptancePath(nextValue?: string | null): string {
  const nextPath = getSafeNextPath(nextValue ?? null);

  return nextPath === "/dashboard"
    ? "/legal/acceptance"
    : `/legal/acceptance?next=${encodeURIComponent(nextPath)}`;
}

export async function getCurrentTermsAcceptance(
  supabase: InviticaSupabaseClient,
  userId: string,
  documents: LegalDocumentSet = LEGAL_DOCUMENTS,
) {
  if (!isLegalAcceptanceEnabled(documents)) {
    return { accepted: true, error: null };
  }

  const { data, error } = await supabase
    .from("terms_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("terms_version", documents.terms.version)
    .eq("privacy_notice_version", documents.privacy.version)
    .maybeSingle();

  return { accepted: !error && data !== null, error };
}

export async function recordCurrentTermsAcceptance(
  supabase: InviticaSupabaseClient,
  userId: string,
  documents: LegalDocumentSet = LEGAL_DOCUMENTS,
) {
  if (!isLegalAcceptanceEnabled(documents)) {
    return { error: new Error("Legal documents are not effective.") };
  }

  const { error } = await supabase.from("terms_acceptances").insert({
    privacy_notice_version: documents.privacy.version,
    terms_version: documents.terms.version,
    user_id: userId,
  });

  return { error: error?.code === "23505" ? null : error };
}

export async function getPostAuthLegalRedirect(
  supabase: InviticaSupabaseClient,
  userId: string,
  nextValue?: string | null,
): Promise<string | null> {
  if (!isLegalAcceptanceEnabled()) {
    return null;
  }

  const acceptance = await getCurrentTermsAcceptance(supabase, userId);
  return acceptance.accepted ? null : buildLegalAcceptancePath(nextValue);
}

export async function setPendingTermsAcceptance(): Promise<void> {
  if (!isLegalAcceptanceEnabled()) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(pendingAcceptanceCookie, createPendingAcceptanceToken(LEGAL_DOCUMENTS), {
    httpOnly: true,
    maxAge: pendingAcceptanceMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function applyPendingTermsAcceptance(
  supabase: InviticaSupabaseClient,
  userId: string,
) {
  if (!isLegalAcceptanceEnabled()) {
    return { error: null };
  }

  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(pendingAcceptanceCookie)?.value;
  if (!pendingToken || !verifyPendingAcceptanceToken(pendingToken, LEGAL_DOCUMENTS)) {
    if (pendingToken) {
      cookieStore.delete(pendingAcceptanceCookie);
    }
    return { error: null };
  }

  const result = await recordCurrentTermsAcceptance(supabase, userId);
  if (!result.error) {
    cookieStore.delete(pendingAcceptanceCookie);
  }
  return result;
}
