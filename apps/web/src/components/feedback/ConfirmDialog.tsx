"use client";

import { useEffect, useId, useRef } from "react";

import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  eyebrow: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Disables both actions and relabels the confirm button while the work runs. */
  pending?: boolean | undefined;
  pendingLabel?: string | undefined;
  title: string;
}

/**
 * One blocking confirmation: eyebrow, question, what actually happens, then the safe answer and
 * the consequential one.
 *
 * **The safe action takes focus and owns Escape.** A confirmation whose default answer is the
 * destructive one is worse than no confirmation, and someone who presses Escape twice by reflex
 * must not find that the second press did the thing.
 *
 * `DiscardChangesDialog` is a thin wrapper over this, so the discard wording it already ships to
 * the two Guest Desk dialogs is unchanged. Its own comment named the problem this generalizes:
 * the Guest Desk, the invitation delete button, the publication panel, and the template upgrade
 * panel each still own a private copy of this markup. Those four are **not** touched here — they
 * are a consolidation worth doing on its own, not inside a settings task.
 *
 * Ids are generated per instance. The version this replaced hardcoded them, which would have
 * collided had two ever been open at once.
 */
export function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  eyebrow,
  onCancel,
  onConfirm,
  pending,
  pendingLabel,
  title,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        // Dismissing the question is not answering it.
        if (!pending) onCancel();
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
  }, [onCancel, pending]);

  return (
    <div className={styles.backdrop}>
      <section
        aria-busy={pending || undefined}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
      >
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className={styles.actions}>
          <button disabled={pending} onClick={onCancel} ref={cancelRef} type="button">
            {cancelLabel}
          </button>
          <button className={styles.discard} disabled={pending} onClick={onConfirm} type="button">
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
