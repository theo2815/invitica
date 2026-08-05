import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "../BrandMark";
import { CreatorNavigation, CreatorRouteFocus } from "./CreatorNavigation";
import styles from "./CreatorShell.module.css";
import { ProfileMenu } from "./ProfileMenu";
import { PullToRefresh } from "./PullToRefresh";

interface CreatorShellProps {
  children: ReactNode;
  email: string | undefined;
  metadata: Record<string, unknown>;
}

export function getCreatorName(metadata: Record<string, unknown>) {
  const fullName = metadata.full_name;

  if (typeof fullName !== "string") {
    return null;
  }

  return fullName.trim().split(/\s+/)[0] || null;
}

export function CreatorShell({ children, email, metadata }: CreatorShellProps) {
  const creatorName = getCreatorName(metadata);

  // `data-surface` lets `globals.css` raise the document background to this shell's header colour.
  // iOS fills the status-bar strip from the document, not from the header element, so without it
  // the strip stays cream and seams against the lighter header.
  return (
    <div className={styles.page} data-surface="creator">
      <a className="skip-link" href="#creator-content">
        Skip to creator content
      </a>

      <aside className={styles.sidebar}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>

        <CreatorNavigation variant="desktop" />

        <ProfileMenu creatorName={creatorName} email={email} variant="desktop" />
      </aside>

      <header className={styles.mobileHeader}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>
        <ProfileMenu creatorName={creatorName} email={email} variant="mobile" />
      </header>

      <main className={styles.content} id="creator-content" tabIndex={-1}>
        {children}
      </main>

      <CreatorNavigation variant="mobile" />
      <CreatorRouteFocus />
      <PullToRefresh />
    </div>
  );
}
