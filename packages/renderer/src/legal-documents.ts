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
 * Document metadata. `effective` status plus an effective date is what turns on creator acceptance
 * and the guest-facing Privacy link, so a version bump here is a product change: existing creators
 * are stopped at `/legal/acceptance` until they accept the new pair.
 *
 * Both documents move together. Acceptance records the pair, so shipping one effective and one
 * draft would leave the gate off with an effective document published.
 */
export const LEGAL_DOCUMENTS = {
  privacy: {
    effectiveDate: "2026-08-08",
    kind: "privacy",
    path: "/privacy",
    publicUrl: "https://invitica.app/privacy",
    status: "effective",
    title: "Privacy Notice",
    version: "1.0",
  },
  terms: {
    effectiveDate: "2026-08-08",
    kind: "terms",
    path: "/terms",
    publicUrl: "https://invitica.app/terms",
    status: "effective",
    title: "Terms of Service",
    version: "1.0",
  },
} as const satisfies LegalDocumentSet;

export function isLegalDocumentEffective(document: LegalDocumentMetadata): boolean {
  return document.status === "effective" && document.effectiveDate !== null;
}

export function isLegalAcceptanceEnabled(documents: LegalDocumentSet = LEGAL_DOCUMENTS): boolean {
  return isLegalDocumentEffective(documents.terms) && isLegalDocumentEffective(documents.privacy);
}
