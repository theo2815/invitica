"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { signOut } from "../../server/auth/actions";
import { PendingFormButton } from "../feedback/PendingFormButton";
import { ChevronDown, LogOut, Settings } from "../Icons";
import styles from "./ProfileMenu.module.css";

interface ProfileMenuProps {
  creatorName: string | null;
  email: string | undefined;
  variant: "desktop" | "mobile";
}

export function ProfileMenu({ creatorName, email, variant }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLAnchorElement>(null);
  const displayName = creatorName ?? "Creator";
  const firstName = displayName.trim().split(/\s+/)[0] || "Creator";
  const initial = (creatorName ?? email ?? "C").charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;

    // The first item takes focus, not the last. Until Settings existed, opening this menu put
    // the keyboard on **Sign out**, where one Enter ended the session.
    const focusFrame = window.requestAnimationFrame(() => settingsRef.current?.focus());

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      className={variant === "mobile" ? styles.profileMenuMobile : styles.profileMenu}
      ref={rootRef}
    >
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Open profile menu for ${displayName}`}
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" className={styles.avatar}>
          {initial}
        </span>
        <span className={styles.identity}>
          <strong>{variant === "mobile" ? firstName : displayName}</strong>
          <span>{email}</span>
        </span>
        <ChevronDown className={styles.chevron ?? ""} />
      </button>

      {open ? (
        <div className={styles.menu} id={menuId}>
          <div className={styles.menuIdentity}>
            <strong>{displayName}</strong>
            <span>{email}</span>
          </div>
          {/* The same destination on both breakpoints. The mobile bottom bar stays at four
              tabs — the 2026-08-06 navigation decision refused the assistant a fifth, and an
              account page has a weaker claim than that one did. */}
          <Link
            className={styles.menuAction}
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            ref={settingsRef}
          >
            <Settings />
            <span>Settings</span>
          </Link>
          <form action={signOut}>
            <PendingFormButton
              className={`${styles.menuAction} ${styles.signOut}`}
              idleContent={
                <>
                  <LogOut />
                  <span>Sign out</span>
                </>
              }
              pendingContent={
                <>
                  <LogOut />
                  <span>Signing out…</span>
                </>
              }
              type="submit"
            />
          </form>
        </div>
      ) : null}
    </div>
  );
}
