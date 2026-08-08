import { LEGAL_DOCUMENTS } from "@invitica/renderer/legal-documents";
import type { Metadata } from "next";

import { LegalDocumentPage } from "../../src/components/legal/LegalDocumentPage";
import { termsDocument } from "../../src/content/legal-documents";

export const metadata: Metadata = {
  title: "Terms of Service — Invitica",
  description:
    "The agreement between you and Invitica for creating, publishing, and sharing digital invitations.",
};

export default function TermsPage() {
  return (
    <LegalDocumentPage
      content={termsDocument}
      document={LEGAL_DOCUMENTS.terms}
      otherDocument={{ href: "/privacy", label: "Privacy Notice" }}
    />
  );
}
