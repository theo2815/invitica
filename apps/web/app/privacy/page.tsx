import { LEGAL_DOCUMENTS } from "@invitica/renderer/legal-documents";
import type { Metadata } from "next";

import { LegalDocumentPage } from "../../src/components/legal/LegalDocumentPage";
import { privacyDocument } from "../../src/content/legal-documents";

export const metadata: Metadata = {
  title: "Privacy Notice — Invitica",
  description:
    "What personal information Invitica handles, why, who processes it, how long it is kept, and how to exercise your rights.",
};

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      content={privacyDocument}
      document={LEGAL_DOCUMENTS.privacy}
      otherDocument={{ href: "/terms", label: "Terms of Service" }}
    />
  );
}
