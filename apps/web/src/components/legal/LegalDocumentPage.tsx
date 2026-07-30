import type { LegalDocumentMetadata } from "@invitica/renderer/legal-documents";
import Link from "next/link";

import type { LegalWorkingDraft } from "../../content/legal-drafts";
import { BrandMark } from "../BrandMark";
import styles from "./LegalDocumentPage.module.css";

interface LegalDocumentPageProps {
  document: LegalDocumentMetadata;
  draft: LegalWorkingDraft;
  otherDocument: {
    href: "/privacy" | "/terms";
    label: string;
  };
}

export function LegalDocumentPage({ document, draft, otherDocument }: LegalDocumentPageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>
        <nav aria-label="Legal document navigation">
          <Link href={otherDocument.href}>{otherDocument.label}</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>

      <main className={styles.main}>
        <article className={styles.document}>
          <header className={styles.documentHeader}>
            <p className={styles.eyebrow}>{draft.documentLabel}</p>
            <h1>{document.title}</h1>
            <p className={styles.status}>Working draft · Not in effect</p>
            <p className={styles.version}>Draft version {document.version}</p>
            {draft.introduction.map((paragraph) => (
              <p className={styles.lede} key={paragraph}>
                {paragraph}
              </p>
            ))}
          </header>

          <aside aria-labelledby="review-blockers-heading" className={styles.blockers}>
            <p className={styles.blockerLabel}>Activation is blocked</p>
            <h2 id="review-blockers-heading">Founder and legal review still required</h2>
            <ul>
              {draft.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </aside>

          <nav aria-label={`${document.title} contents`} className={styles.contents}>
            <p>On this page</p>
            <ol>
              {draft.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className={styles.sections}>
            {draft.sections.map((section) => (
              <section id={section.id} key={section.id}>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
                {section.reviewNote ? (
                  <p className={styles.reviewNote}>
                    <strong>Review blocker:</strong> {section.reviewNote}
                  </p>
                ) : null}
              </section>
            ))}
          </div>

          <section aria-labelledby="draft-sources-heading" className={styles.sources}>
            <h2 id="draft-sources-heading">Official sources used for this working draft</h2>
            <p>
              These sources inform the review scaffold. They do not replace advice about Invitica’s
              particular facts.
            </p>
            <ul>
              {draft.sources.map((source) => (
                <li key={source.href}>
                  <a href={source.href} rel="noreferrer" target="_blank">
                    {source.label} <span>(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>

      <footer className={styles.footer}>
        <p>Invitica · Premium digital invitations for meaningful gatherings.</p>
        <nav aria-label="Legal footer navigation">
          <Link href={otherDocument.href}>{otherDocument.label}</Link>
          <Link href="/">Return home</Link>
        </nav>
      </footer>
    </div>
  );
}
