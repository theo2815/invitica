import { LEGAL_DOCUMENTS } from "@invitica/renderer/legal-documents";
import type { Metadata } from "next";

import { LegalDocumentPage } from "../../src/components/legal/LegalDocumentPage";
import { termsWorkingDraft } from "../../src/content/legal-drafts";

export const metadata: Metadata = {
  title: "Terms of Service — Invitica",
  description: "Invitica's Terms of Service working draft for founder and legal review.",
};

export default function TermsPage() {
  return (
    <LegalDocumentPage
      document={LEGAL_DOCUMENTS.terms}
      draft={termsWorkingDraft}
      otherDocument={{ href: "/privacy", label: "Privacy Notice" }}
    />
  );
}
