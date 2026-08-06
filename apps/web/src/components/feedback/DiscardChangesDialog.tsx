"use client";

import { useEffect, useRef } from "react";

import styles from "./DiscardChangesDialog.module.css";

interface DiscardChangesDialogProps {
  confirmLabel?: string | undefined;
  description: string;
  eyebrow: string;
  onDiscard: () => void;
  onKeepEditing: () => void;
  title: string;
}

/**
 * "You are about to lose what you typed" — the last thing between a mis-aimed tap and an
 * hour of work.
 *
 * The same shape Invitica already confirms with everywhere else: eyebrow, question, what
 * actually happens, then the safe action and the destructive one. `GuestDesk`, the invitation
 * delete button, the publication panel, and the template upgrade panel each own a private copy
 * of that markup; this is the first one written to be shared, because the two Guest Desk
 * dialogs that need it must not word the same warning two different ways.
 *
 * **Keep editing takes focus and owns Escape.** A confirmation whose default answer discards
 * work is worse than no confirmation, and a creator who hits Escape twice by reflex must not
 * find that the second press threw the work away.
 *
 * It renders above the dialog it is protecting, and that dialog must suspend its own focus
 * trap while this is open — otherwise Tab walks straight back into the form underneath.
 */
export function DiscardChangesDialog({
  confirmLabel = "Discard",
  description,
  eyebrow,
  onDiscard,
  onKeepEditing,
  title,
}: DiscardChangesDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        // Dismissing the question is not answering it. Escape keeps the work.
        onKeepEditing();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onKeepEditing]);

  return (
    <div className={styles.backdrop}>
      <section
        aria-describedby="discard-changes-description"
        aria-labelledby="discard-changes-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
      >
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 id="discard-changes-title">{title}</h2>
        <p id="discard-changes-description">{description}</p>
        <div className={styles.actions}>
          <button onClick={onKeepEditing} ref={keepRef} type="button">
            Keep editing
          </button>
          <button className={styles.discard} onClick={onDiscard} type="button">
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
