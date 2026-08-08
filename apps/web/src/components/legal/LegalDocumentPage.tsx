import type { LegalDocumentMetadata } from "@invitica/renderer/legal-documents";
import Link from "next/link";

import type { LegalDocumentContent, LegalDocumentTable } from "../../content/legal-documents";
import { BrandMark } from "../BrandMark";
import styles from "./LegalDocumentPage.module.css";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Formatted here rather than through `Intl` so the rendered string cannot shift with the build
 * machine's locale or ICU build. The stored value is always `YYYY-MM-DD`.
 */
export function formatEffectiveDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  const monthName = monthNames[Number(month) - 1];

  if (!year || !monthName || !day) {
    return isoDate;
  }

  return `${Number(day)} ${monthName} ${year}`;
}

function DocumentTable({ caption, table }: { caption: string; table: LegalDocumentTable }) {
  return (
    // Focusable on purpose: below roughly 34rem the table scrolls sideways inside this box, and a
    // keyboard-only reader has no other way to reach the far columns of the retention or
    // lawful-basis tables. Axe reports `scrollable-region-focusable` at serious impact without it,
    // measured at 390 and 320 px in both themes, which is why the lint rule is suppressed here
    // rather than the attribute dropped.
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region needs keyboard access
    <section aria-label={caption} className={styles.tableScroll} tabIndex={0}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>{caption}</caption>
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={cell} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={cell}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface LegalDocumentPageProps {
  content: LegalDocumentContent;
  document: LegalDocumentMetadata;
  otherDocument: {
    href: "/privacy" | "/terms";
    label: string;
  };
}

export function LegalDocumentPage({ content, document, otherDocument }: LegalDocumentPageProps) {
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
            <p className={styles.eyebrow}>{content.documentLabel}</p>
            <h1>{document.title}</h1>
            {document.effectiveDate ? (
              <p className={styles.status}>
                In effect since {formatEffectiveDate(document.effectiveDate)}
              </p>
            ) : null}
            <p className={styles.version}>Version {document.version}</p>
            {content.introduction.map((paragraph) => (
              <p className={styles.lede} key={paragraph}>
                {paragraph}
              </p>
            ))}
          </header>

          {/*
           * The sticky contents must be bounded by a wrapper that ends before Primary sources.
           * Without it the nav's grid row is the whole document and a 20-plus entry list, which is
           * taller than a laptop viewport, runs straight through the sources section.
           */}
          <div className={styles.contentLayout}>
            <nav aria-label={`${document.title} contents`} className={styles.contents}>
              <p>On this page</p>
              <ol>
                {content.sections.map((section) => (
                  <li key={section.id}>
                    <a className={styles.contentsLink} href={`#${section.id}`}>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className={styles.sections}>
              {content.sections.map((section) => (
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
                  {section.table ? (
                    <DocumentTable caption={section.title} table={section.table} />
                  ) : null}
                </section>
              ))}
            </div>
          </div>

          <section aria-labelledby="legal-sources-heading" className={styles.sources}>
            <h2 id="legal-sources-heading">Primary sources</h2>
            <p>{content.sourcesNote}</p>
            <ul>
              {content.sources.map((source) => (
                <li key={source.href}>
                  <a
                    className={styles.sourceLink}
                    href={source.href}
                    rel="noreferrer"
                    target="_blank"
                  >
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
