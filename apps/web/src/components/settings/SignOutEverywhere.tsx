"use client";

import { useState, useTransition } from "react";

import { signOutEverywhere } from "../../server/account/actions";
import { ConfirmDialog } from "../feedback/ConfirmDialog";
import { LogOut } from "../Icons";
import styles from "./Settings.module.css";

/**
 * Ends every session on every device, this one included.
 *
 * The reason it belongs here is the same one that put Invi's saved conversations in PostgreSQL
 * rather than `localStorage`: a creator who signed in on a borrowed or shared machine has no
 * other way to close that session, and their guest lists are reachable from it.
 *
 * The action redirects, so there is no success state to render — the creator lands on sign-in.
 */
export function SignOutEverywhere() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className={styles.panelActions}>
        <button
          className={styles.dangerButton}
          disabled={pending}
          onClick={() => setConfirming(true)}
          type="button"
        >
          <LogOut />
          <span>Sign out everywhere</span>
        </button>
      </div>

      {confirming ? (
        <ConfirmDialog
          cancelLabel="Stay signed in"
          confirmLabel="Sign out everywhere"
          description="Every device signed in to Invitica is signed out, including this one. Nothing is deleted, and you can sign back in with the same email and password."
          eyebrow="Sessions"
          onCancel={() => setConfirming(false)}
          onConfirm={() => startTransition(() => signOutEverywhere())}
          pending={pending}
          pendingLabel="Signing out…"
          title="Sign out on every device?"
        />
      ) : null}
    </>
  );
}
