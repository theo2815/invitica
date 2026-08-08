"use client";

import { ConfirmDialog } from "./ConfirmDialog";

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
 * The behavior is `ConfirmDialog`'s, and the wording is this component's job: **Keep editing**
 * is the safe answer, so it takes focus and owns Escape. Nothing about what the two Guest Desk
 * dialogs render changed when the general dialog was extracted.
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
  return (
    <ConfirmDialog
      cancelLabel="Keep editing"
      confirmLabel={confirmLabel}
      description={description}
      eyebrow={eyebrow}
      onCancel={onKeepEditing}
      onConfirm={onDiscard}
      title={title}
    />
  );
}
