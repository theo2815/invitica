import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "../BrandMark";
import styles from "./AuthPage.module.css";

interface AuthShellProps {
  children: ReactNode;
  description: string;
  eyebrow: string;
  heading: string;
  headingId: string;
  story?: {
    heading: string;
    label: string;
    text: string;
  };
}

export function AuthShell({
  children,
  description,
  eyebrow,
  heading,
  headingId,
  story,
}: AuthShellProps) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>
        <span className={styles.headerNote}>Invitations, thoughtfully made</span>
      </header>

      <div className={story ? styles.layout : styles.noticeLayout}>
        {story ? (
          <section aria-labelledby={`${headingId}-story`} className={styles.story}>
            <p className={styles.storyLabel}>{story.label}</p>
            <h2 id={`${headingId}-story`}>{story.heading}</h2>
            <p>{story.text}</p>
            <div aria-hidden="true" className={styles.storyRule}>
              <span />
            </div>
          </section>
        ) : null}

        <section aria-labelledby={headingId} className={styles.panel}>
          <div className={styles.panelHeading}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 id={headingId}>{heading}</h1>
            <p>{description}</p>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
