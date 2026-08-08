import { isLegalAcceptanceEnabled, LEGAL_DOCUMENTS } from "@invitica/renderer/legal-documents";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LegalAcceptanceGate } from "../../../src/components/legal/LegalAcceptanceGate";
import { getSafeNextPath } from "../../../src/server/auth/redirects";
import { requireConfirmedUser } from "../../../src/server/auth/session";
import { getCurrentTermsAcceptance } from "../../../src/server/legal/acceptance";

export const metadata: Metadata = {
  title: "Review the Terms — Invitica",
  description: "Review and accept Invitica's current Terms of Service.",
};

interface LegalAcceptancePageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function LegalAcceptancePage({ searchParams }: LegalAcceptancePageProps) {
  const { next } = await searchParams;
  const nextPath = getSafeNextPath(typeof next === "string" ? next : null);

  if (!isLegalAcceptanceEnabled(LEGAL_DOCUMENTS)) {
    redirect(nextPath);
  }

  const { supabase, user } = await requireConfirmedUser({
    allowMissingLegalAcceptance: true,
  });
  const acceptance = await getCurrentTermsAcceptance(supabase, user.id);
  if (acceptance.accepted) {
    redirect(nextPath);
  }

  return <LegalAcceptanceGate nextPath={nextPath} />;
}
