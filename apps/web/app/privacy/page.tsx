import { LEGAL_DOCUMENTS } from "@invitica/renderer/legal-documents";
import type { Metadata } from "next";

import { LegalDocumentPage } from "../../src/components/legal/LegalDocumentPage";
import { privacyWorkingDraft } from "../../src/content/legal-drafts";

export const metadata: Metadata = {
  title: "Privacy Notice — Invitica",
  description: "Invitica's Privacy Notice working draft for founder and legal review.",
};

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      document={LEGAL_DOCUMENTS.privacy}
      draft={privacyWorkingDraft}
      otherDocument={{ href: "/terms", label: "Terms of Service" }}
    />
  );
}
