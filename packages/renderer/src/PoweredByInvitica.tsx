import {
  INVITICA_PUBLIC_URL,
  isLegalDocumentEffective,
  LEGAL_DOCUMENTS,
  type LegalDocumentMetadata,
} from "./legal-documents.js";

interface PrivacyNoticeLinkProps {
  document?: LegalDocumentMetadata;
}

/**
 * Guest-facing legal access remains absent while the notice is a draft. Once counsel marks it
 * effective, the link opens separately and suppresses the referrer so an unlisted invitation
 * identifier is not disclosed to the legal page.
 */
export function PrivacyNoticeLink({ document = LEGAL_DOCUMENTS.privacy }: PrivacyNoticeLinkProps) {
  if (!isLegalDocumentEffective(document)) {
    return null;
  }

  return (
    <a
      aria-label="Privacy notice (opens in a new tab)"
      className="iv-privacy"
      href={document.publicUrl}
      referrerPolicy="no-referrer"
      rel="noreferrer"
      target="_blank"
    >
      Privacy
    </a>
  );
}

/**
 * Platform attribution shown at the foot of a published invitation. The founder approved the
 * Invitica name as a no-referrer link that opens the public landing page in a separate tab.
 */
export function PoweredByInvitica() {
  return (
    <p className="iv-powered">
      Powered by{" "}
      <a
        aria-label="Invitica home (opens in a new tab)"
        className="iv-home"
        href={INVITICA_PUBLIC_URL}
        referrerPolicy="no-referrer"
        rel="noreferrer"
        target="_blank"
      >
        Invitica
      </a>
      <PrivacyNoticeLink />
    </p>
  );
}

export const privacyNoticeLinkStyles = `
.iv-privacy {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  margin-left: 0.9rem;
  color: inherit;
  font: inherit;
  letter-spacing: 0.08em;
  text-underline-offset: 0.22em;
}
`;

export const poweredByInviticaStyles = `
.iv-powered {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.iv-home {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  color: inherit;
  font: inherit;
  font-weight: 700;
  letter-spacing: inherit;
  text-underline-offset: 0.22em;
}
${privacyNoticeLinkStyles}
`;
