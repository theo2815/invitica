"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  loadInvitationPublicationStatusAction,
  publishInvitationAction,
} from "../../server/invitations/actions";
import type { InvitationPublicationStatus } from "../../server/invitations/publications";
import styles from "./InvitationPublicationPanel.module.css";

const STATUS_POLL_MS = 2_000;
const MAX_STATUS_POLLS = 30;

interface InvitationPublicationPanelProps {
  assetsReady: boolean;
  canPublish: boolean;
  detailsReady: boolean;
  draftReady: boolean;
  initialPublication: InvitationPublicationStatus;
  invitationId: string;
  revision: number;
  titleReady: boolean;
}

function publicationLabel(publication: InvitationPublicationStatus, revision: number): string {
  if (publication.status === "publishing") return "Preparing your invitation";
  if (publication.status === "retrying") return "Retrying secure delivery";
  if (publication.status === "failed") return "Publishing needs attention";
  if (publication.status === "delivered" && publication.publishedRevision === revision) {
    return "Invitation is live";
  }
  if (publication.livePublicIdentifier) return "A previous revision is live";
  return "Ready when you are";
}

export function InvitationPublicationPanel({
  assetsReady,
  canPublish,
  detailsReady,
  draftReady,
  initialPublication,
  invitationId,
  revision,
  titleReady,
}: InvitationPublicationPanelProps) {
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publication, setPublication] = useState(initialPublication);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const isCurrentRevisionLive =
    publication.status === "delivered" && publication.publishedRevision === revision;
  const isProcessing = publication.status === "publishing" || publication.status === "retrying";

  useEffect(() => {
    if (!confirmationOpen) return;
    cancelButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setConfirmationOpen(false);
        publishButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmationOpen]);

  useEffect(() => {
    if (!isProcessing) return;
    let cancelled = false;
    let completedPolls = 0;
    let timer: number | undefined;

    const schedulePoll = () => {
      if (cancelled || timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void pollPublication();
      }, STATUS_POLL_MS);
    };

    const pollPublication = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      completedPolls += 1;

      try {
        const result = await loadInvitationPublicationStatusAction({ invitationId });
        if (result.status === "loaded") {
          setPublication(result.publication);
          setActionMessage(null);
        } else {
          setActionMessage(result.message);
        }
      } catch {
        setActionMessage("Publication status is temporarily unavailable. We will try again.");
      }

      if (cancelled) return;
      if (completedPolls >= MAX_STATUS_POLLS) {
        setActionMessage(
          "Publishing is taking longer than expected. Refresh to check the latest saved status.",
        );
        return;
      }
      schedulePoll();
    };

    const resumeWhenVisible = () => {
      if (document.visibilityState === "visible") schedulePoll();
    };

    document.addEventListener("visibilitychange", resumeWhenVisible);
    schedulePoll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resumeWhenVisible);
    };
  }, [invitationId, isProcessing]);

  function closeConfirmation() {
    setConfirmationOpen(false);
    publishButtonRef.current?.focus();
  }

  async function confirmPublication() {
    closeConfirmation();
    setActionMessage(null);
    setIsSubmitting(true);
    try {
      const result = await publishInvitationAction({
        expectedRevision: revision,
        idempotencyKey: crypto.randomUUID(),
        invitationId,
      });
      if (result.status === "accepted") {
        setPublication((current) => ({
          ...current,
          errorCode: null,
          publicationId: result.publicationId,
          publishedRevision: revision,
          status: "publishing",
        }));
      } else {
        setActionMessage(result.message);
      }
    } catch {
      setActionMessage("Publishing could not start. Your saved draft is safe; try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = !canPublish || isProcessing || isSubmitting || isCurrentRevisionLive;
  const buttonLabel = isCurrentRevisionLive
    ? "Published"
    : isSubmitting
      ? "Starting…"
      : isProcessing
        ? "Publishing…"
        : publication.status === "failed"
          ? "Try publishing again"
          : publication.livePublicIdentifier
            ? "Publish update"
            : "Publish invitation";

  return (
    <section aria-labelledby="publication-heading" className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <p>Publication</p>
          <h3 id="publication-heading">Publish the finished invitation</h3>
        </div>
        <span data-status={publication.status}>{publicationLabel(publication, revision)}</span>
      </div>

      <ul aria-label="Publication readiness" className={styles.checklist}>
        <li data-ready={draftReady}>
          <span aria-hidden="true" />
          Draft changes are saved
        </li>
        <li data-ready={titleReady}>
          <span aria-hidden="true" />
          Invitation title is complete
        </li>
        <li data-ready={detailsReady}>
          <span aria-hidden="true" />
          Venue and RSVP details are complete
        </li>
        <li data-ready={assetsReady}>
          <span aria-hidden="true" />
          Media references are resolved
        </li>
      </ul>

      <div aria-live="polite" className={styles.statusMessage}>
        {publication.status === "publishing" ? <p>Building a verified guest copy now.</p> : null}
        {publication.status === "retrying" ? <p>Delivery is retrying automatically.</p> : null}
        {publication.status === "failed" ? (
          <p>Nothing new went live. Your saved draft is safe; try publishing again.</p>
        ) : null}
        {actionMessage ? <p role="alert">{actionMessage}</p> : null}
        {publication.livePublicIdentifier && !isCurrentRevisionLive ? (
          <p>Your previous published revision remains live while this update is prepared.</p>
        ) : null}
      </div>

      {publication.livePublicIdentifier ? (
        <div className={styles.nextStep}>
          <p>
            Your invitation is safely published. Continue to the guest desk when you are ready to
            prepare sharing.
          </p>
          <Link href={`/dashboard/guests?invitationId=${encodeURIComponent(invitationId)}`}>
            Go to Guests &amp; RSVPs
          </Link>
        </div>
      ) : null}

      <button
        className={styles.publishButton}
        disabled={disabled}
        onClick={() => setConfirmationOpen(true)}
        ref={publishButtonRef}
        type="button"
      >
        {buttonLabel}
      </button>
      {!canPublish ? (
        <p className={styles.hint}>Finish saving the current edit before publishing.</p>
      ) : null}

      {confirmationOpen && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.dialogBackdrop}>
              <section
                aria-describedby="publication-confirmation-description"
                aria-labelledby="publication-confirmation-title"
                aria-modal="true"
                className={styles.dialog}
                role="dialog"
              >
                <p className={styles.dialogEyebrow}>Final check</p>
                <h3 id="publication-confirmation-title">Publish revision {revision}?</h3>
                <p id="publication-confirmation-description">
                  We will create a verified guest copy. After delivery is confirmed, continue to
                  Guests &amp; RSVPs to prepare sharing.
                </p>
                <div className={styles.dialogActions}>
                  <button onClick={closeConfirmation} ref={cancelButtonRef} type="button">
                    Keep editing
                  </button>
                  <button onClick={() => void confirmPublication()} type="button">
                    Publish now
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
