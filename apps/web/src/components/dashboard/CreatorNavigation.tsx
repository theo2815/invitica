"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Envelope, Grid, Home, Users } from "../Icons";
import styles from "./CreatorShell.module.css";

type CreatorPage = "guests" | "invitations" | "overview" | "templates";

interface WorkspaceLinkProps {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
  mobileLabel?: string;
  variant: "desktop" | "mobile";
}

interface PendingLinkContentProps {
  icon: ReactNode;
  label: string;
  mobileLabel: string | undefined;
  variant: WorkspaceLinkProps["variant"];
}

function creatorPageFromPath(pathname: string): CreatorPage {
  if (pathname.startsWith("/dashboard/invitations")) return "invitations";
  if (pathname.startsWith("/dashboard/templates")) return "templates";
  if (pathname.startsWith("/dashboard/guests")) return "guests";
  return "overview";
}

function PendingLinkContent({ icon, label, mobileLabel, variant }: PendingLinkContentProps) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span
        className={variant === "mobile" ? styles.mobileNavContent : styles.navLinkContent}
        data-pending={pending}
      >
        {icon}
        <span>{variant === "mobile" ? (mobileLabel ?? label) : label}</span>
        <span aria-hidden="true" className={styles.pendingMark}>
          {pending ? "…" : ""}
        </span>
      </span>
      <span aria-live="polite" className={styles.visuallyHidden}>
        {pending ? `Loading ${label}…` : ""}
      </span>
    </>
  );
}

function WorkspaceLink({ active, href, icon, label, mobileLabel, variant }: WorkspaceLinkProps) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        variant === "desktop" ? (active ? styles.activeNavItem : styles.navItem) : undefined
      }
      href={href}
    >
      <PendingLinkContent icon={icon} label={label} mobileLabel={mobileLabel} variant={variant} />
    </Link>
  );
}

export function CreatorNavigation({ variant }: Pick<WorkspaceLinkProps, "variant">) {
  const activePage = creatorPageFromPath(usePathname());

  const links = (
    <>
      <WorkspaceLink
        active={activePage === "overview"}
        href="/dashboard"
        icon={<Home />}
        label="Overview"
        mobileLabel="Home"
        variant={variant}
      />
      <WorkspaceLink
        active={activePage === "invitations"}
        href="/dashboard/invitations"
        icon={<Envelope />}
        label="Invitations"
        variant={variant}
      />
      <WorkspaceLink
        active={activePage === "templates"}
        href="/dashboard/templates"
        icon={<Grid />}
        label="Templates"
        variant={variant}
      />
      <WorkspaceLink
        active={activePage === "guests"}
        href="/dashboard/guests"
        icon={<Users />}
        label="Guests & RSVPs"
        mobileLabel="RSVPs"
        variant={variant}
      />
    </>
  );

  return variant === "desktop" ? (
    <nav aria-label="Creator workspace" className={styles.navigation}>
      {links}
    </nav>
  ) : (
    <nav aria-label="Mobile creator workspace" className={styles.mobileNavigation}>
      {links}
    </nav>
  );
}

export function CreatorRouteFocus() {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (previousPathRef.current === pathname) return;

    previousPathRef.current = pathname;
    const page = creatorPageFromPath(pathname);
    const label =
      page === "guests" ? "Guests and RSVPs" : `${page[0]?.toUpperCase()}${page.slice(1)}`;
    setAnnouncement(`${label} loaded.`);
    const frame = window.requestAnimationFrame(() =>
      document.getElementById("creator-content")?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <span aria-live="polite" className={styles.visuallyHidden}>
      {announcement}
    </span>
  );
}
