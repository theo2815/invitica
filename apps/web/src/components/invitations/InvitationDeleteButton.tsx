"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { deleteInvitationAction } from "../../server/invitations/actions";
import styles from "./InvitationDeleteButton.module.css";

interface InvitationDeleteButtonProps {
  invitationId: string;
  title: string;
}

export function InvitationDeleteButton({ invitationId, title }: InvitationDeleteButtonProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialogOpen) return;
    cancelButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) {
        event.preventDefault();
        setDialogOpen(false);
        deleteButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialogOpen, isDeleting]);

  function closeDialog() {
    if (isDeleting) return;
    setDialogOpen(false);
    deleteButtonRef.current?.focus();
  }

  async function confirmDeletion() {
    if (isDeleting || isRefreshing) return;

    setErrorMessage(null);
    setIsDeleting(true);
    try {
      const result = await deleteInvitationAction({ invitationId });

      if (result.status === "deleted") {
        setDialogOpen(false);
        startRefresh(() => router.refresh());
        return;
      }

      setErrorMessage(result.message);
    } catch {
      setErrorMessage(
        "Invitica could not delete this invitation. Check your connection and try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <button
        aria-busy={isRefreshing || undefined}
        className={styles.deleteButton}
        disabled={isRefreshing}
        onClick={() => {
          setErrorMessage(null);
          setDialogOpen(true);
        }}
        ref={deleteButtonRef}
        type="button"
      >
        {isRefreshing ? "Updating…" : "Delete"}
      </button>

      {dialogOpen ? (
        <div className={styles.backdrop}>
          <section
            aria-describedby="delete-invitation-description"
            aria-labelledby="delete-invitation-title"
            aria-busy={isDeleting || undefined}
            aria-modal="true"
            className={styles.dialog}
            role="dialog"
          >
            <p className={styles.eyebrow}>Permanent action</p>
            <h2 id="delete-invitation-title">Delete this invitation?</h2>
            <p id="delete-invitation-description">
              “{title}” and its saved draft will be permanently removed. This cannot be undone.
            </p>
            {errorMessage ? <p role="alert">{errorMessage}</p> : null}
            <div className={styles.actions}>
              <button
                disabled={isDeleting}
                onClick={closeDialog}
                ref={cancelButtonRef}
                type="button"
              >
                Keep invitation
              </button>
              <button disabled={isDeleting} onClick={() => void confirmDeletion()} type="button">
                {isDeleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
