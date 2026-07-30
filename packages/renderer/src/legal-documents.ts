export type LegalDocumentKind = "privacy" | "terms";
export type LegalDocumentStatus = "draft" | "effective";

export interface LegalDocumentMetadata {
  effectiveDate: string | null;
  kind: LegalDocumentKind;
  path: "/privacy" | "/terms";
  publicUrl: `https://${string}`;
  status: LegalDocumentStatus;
  title: string;
  version: string;
}

export interface LegalDocumentSet {
  privacy: LegalDocumentMetadata;
  terms: LegalDocumentMetadata;
}

export const INVITICA_PUBLIC_URL = "https://invitica.app/";

/**
 * Counsel-owned document metadata. Draft documents are public status pages only: they cannot be
 * accepted, do not gate creator access, and do not add a Privacy link to guest invitations.
 */
export const LEGAL_DOCUMENTS = {
  privacy: {
    effectiveDate: null,
    kind: "privacy",
    path: "/privacy",
    publicUrl: "https://invitica.app/privacy",
    status: "draft",
    title: "Privacy Notice",
    version: "draft-2026-07-29",
  },
  terms: {
    effectiveDate: null,
    kind: "terms",
    path: "/terms",
    publicUrl: "https://invitica.app/terms",
    status: "draft",
    title: "Terms of Service",
    version: "draft-2026-07-29",
  },
} as const satisfies LegalDocumentSet;

export function isLegalDocumentEffective(document: LegalDocumentMetadata): boolean {
  return document.status === "effective" && document.effectiveDate !== null;
}

export function isLegalAcceptanceEnabled(documents: LegalDocumentSet = LEGAL_DOCUMENTS): boolean {
  return isLegalDocumentEffective(documents.terms) && isLegalDocumentEffective(documents.privacy);
}
