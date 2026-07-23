"use client";

import { useEffect, useId, useRef, useState } from "react";

import { signOut } from "../../server/auth/actions";
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
  const signOutRef = useRef<HTMLButtonElement>(null);
  const displayName = creatorName ?? "Creator";
  const firstName = displayName.trim().split(/\s+/)[0] || "Creator";
  const initial = (creatorName ?? email ?? "C").charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;

    const focusFrame = window.requestAnimationFrame(() => signOutRef.current?.focus());

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
          <button className={styles.menuAction} disabled type="button">
            <Settings />
            <span>Settings</span>
            <small>Coming soon</small>
          </button>
          <form action={signOut}>
            <button
              className={`${styles.menuAction} ${styles.signOut}`}
              ref={signOutRef}
              type="submit"
            >
              <LogOut />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
