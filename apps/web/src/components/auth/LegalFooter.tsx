import { isLegalAcceptanceEnabled, LEGAL_DOCUMENTS } from "@invitica/renderer/legal-documents";
import Link from "next/link";

import styles from "./AuthPage.module.css";

/**
 * Terms and Privacy on every authentication route, with the version and date they are effective at.
 *
 * The register checkbox is consent and appears once; this is reference and appears everywhere,
 * because someone deciding whether to sign in at all should not have to reach the dashboard to read
 * what they are signing in under. Both values come from `LEGAL_DOCUMENTS` rather than being typed,
 * so a version bump moves this line with it.
 *
 * Hidden while either document is a draft, matching the rule the guest invitation footer and the
 * registration checkbox already follow — a draft cannot be relied on and should not be advertised.
 */
export function LegalFooter() {
  if (!isLegalAcceptanceEnabled()) {
    return null;
  }

  return (
    <p className={styles.legalFooter}>
      <Link href="/terms" rel="noreferrer" target="_blank">
        Terms of Service
      </Link>
      <span aria-hidden="true">·</span>
      <Link href="/privacy" rel="noreferrer" target="_blank">
        Privacy Notice
      </Link>
      <span className={styles.legalFooterVersion}>
        Version {LEGAL_DOCUMENTS.terms.version}, effective {LEGAL_DOCUMENTS.terms.effectiveDate}
      </span>
    </p>
  );
}
