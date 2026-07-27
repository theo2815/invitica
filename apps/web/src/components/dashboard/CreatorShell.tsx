import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "../BrandMark";
import { CreatorNavigation, CreatorRouteFocus } from "./CreatorNavigation";
import styles from "./CreatorShell.module.css";
import { ProfileMenu } from "./ProfileMenu";

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

  return (
    <div className={styles.page}>
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
    </div>
  );
}
