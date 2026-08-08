"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { InviMark } from "../assistant/InviMascot";
import { Envelope, Grid, Home, Users } from "../Icons";
import styles from "./CreatorShell.module.css";

type CreatorPage = "assistant" | "guests" | "invitations" | "overview" | "templates";

interface CreatorNavigationProps extends Pick<WorkspaceLinkProps, "variant"> {
  showAssistant?: boolean;
}

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
  if (pathname.startsWith("/dashboard/assistant")) return "assistant";
  if (pathname.startsWith("/dashboard/invitations")) return "invitations";
  if (pathname.startsWith("/dashboard/templates")) return "templates";
  if (pathname.startsWith("/dashboard/guests")) return "guests";
  return "overview";
}

function PendingLinkContent({ icon, label, mobileLabel, variant }: PendingLinkContentProps) {
  const { pending } = useLinkStatus();
  const isMobile = variant === "mobile";

  return (
    <>
      <span
        className={isMobile ? styles.mobileNavContent : styles.navLinkContent}
        data-pending={pending}
      >
        {/* Mobile has no room for an inline mark beside a stacked icon/label, so a pending route
            swaps the tab's icon for a spinner instead. Desktop keeps the inline "…" after the label. */}
        {isMobile && pending ? <span aria-hidden="true" className={styles.navSpinner} /> : icon}
        <span>{isMobile ? (mobileLabel ?? label) : label}</span>
        {isMobile ? null : (
          <span aria-hidden="true" className={styles.pendingMark}>
            {pending ? "…" : ""}
          </span>
        )}
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
      // Activating the destination you are already on used to start a real navigation: the
      // tab swapped its icon for a spinner, the route skeleton replaced the page, and the
      // same content came back. Nothing changed except the wait. The element stays a link
      // so `href`, focus order, and open-in-new-tab are untouched — only the same-page
      // default is dropped.
      onClick={(event) => {
        if (active) event.preventDefault();
      }}
    >
      <PendingLinkContent icon={icon} label={label} mobileLabel={mobileLabel} variant={variant} />
    </Link>
  );
}

export function CreatorNavigation({ showAssistant = false, variant }: CreatorNavigationProps) {
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
      {variant === "desktop" && showAssistant ? (
        <WorkspaceLink
          active={activePage === "assistant"}
          href="/dashboard/assistant"
          icon={<InviMark />}
          label="Invi"
          variant={variant}
        />
      ) : null}
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
      page === "guests"
        ? "Guests and RSVPs"
        : page === "assistant"
          ? "Invi"
          : `${page[0]?.toUpperCase()}${page.slice(1)}`;
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
