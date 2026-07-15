import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "../../server/auth/actions";
import { BrandMark } from "../BrandMark";
import { Envelope, Grid, Home, Settings, Users } from "../Icons";
import styles from "./CreatorShell.module.css";

type CreatorPage = "guests" | "invitations" | "overview" | "templates";

interface CreatorShellProps {
  activePage: CreatorPage;
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

export function CreatorShell({ activePage, children, email, metadata }: CreatorShellProps) {
  const creatorName = getCreatorName(metadata);

  return (
    <main className={styles.page}>
      <a className="skip-link" href="#creator-content">
        Skip to creator content
      </a>

      <aside className={styles.sidebar}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>

        <nav aria-label="Creator workspace" className={styles.navigation}>
          <Link
            aria-current={activePage === "overview" ? "page" : undefined}
            className={activePage === "overview" ? styles.activeNavItem : styles.navItem}
            href="/dashboard"
          >
            <Home />
            Overview
          </Link>
          <Link
            aria-current={activePage === "invitations" ? "page" : undefined}
            className={activePage === "invitations" ? styles.activeNavItem : styles.navItem}
            href="/dashboard/invitations"
          >
            <Envelope />
            Invitations
          </Link>
          <Link
            aria-current={activePage === "templates" ? "page" : undefined}
            className={activePage === "templates" ? styles.activeNavItem : styles.navItem}
            href="/dashboard/templates"
          >
            <Grid />
            Templates
          </Link>
          <Link
            aria-current={activePage === "guests" ? "page" : undefined}
            className={activePage === "guests" ? styles.activeNavItem : styles.navItem}
            href="/dashboard/guests"
          >
            <Users />
            Guests & RSVPs
          </Link>
          <span aria-disabled="true" className={styles.disabledNavItem}>
            <Settings />
            Settings
            <small>Soon</small>
          </span>
        </nav>

        <div className={styles.account}>
          <span aria-hidden="true" className={styles.avatar}>
            {(creatorName ?? email ?? "C").charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{creatorName ?? "Creator"}</strong>
            <span>{email}</span>
          </div>
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <header className={styles.mobileHeader}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </header>

      <div className={styles.content} id="creator-content" tabIndex={-1}>
        {children}
      </div>

      <nav aria-label="Mobile creator workspace" className={styles.mobileNavigation}>
        <Link aria-current={activePage === "overview" ? "page" : undefined} href="/dashboard">
          <Home />
          <span>Home</span>
        </Link>
        <Link
          aria-current={activePage === "invitations" ? "page" : undefined}
          href="/dashboard/invitations"
        >
          <Envelope />
          <span>Invitations</span>
        </Link>
        <Link
          aria-current={activePage === "templates" ? "page" : undefined}
          href="/dashboard/templates"
        >
          <Grid />
          <span>Templates</span>
        </Link>
        <Link aria-current={activePage === "guests" ? "page" : undefined} href="/dashboard/guests">
          <Users />
          <span>RSVPs</span>
        </Link>
      </nav>
    </main>
  );
}
