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

/**
 * Delivery is usually confirmed within a second or two of the job starting, so the
 * first check is nearly immediate and the interval only relaxes afterwards. Waiting a
 * flat two seconds before *asking* meant even an already-finished publication showed
 * "Publishing…" for the full interval, and every later transition was rounded up to
 * the next tick.
 */
const FIRST_STATUS_POLL_MS = 350;
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

/**
 * Every publication failure used to read "try publishing again", so a creator whose hero photo could
 * not be processed and a creator whose delivery never started saw the same sentence and clicked the
 * same button. The codes already travel with the status; these turn each one into the reason and the
 * next action, and say plainly when editing the draft cannot help.
 */
interface PublicationProblem {
  readonly detail: string;
  readonly draftCanFix: boolean;
  readonly nextStep: string;
}

function publicationProblem(errorCode: string | null): PublicationProblem {
  switch (errorCode) {
    case "social_preview_failed":
      return {
        detail: "We could not build the shareable preview image from your hero photo.",
        draftCanFix: true,
        nextStep: "Open the Hero section, replace or remove the photo, then publish again.",
      };
    case "alias_conflict":
      return {
        detail: "Another publication is already using this invitation's guest link.",
        draftCanFix: false,
        nextStep: "Wait a few seconds and publish again. Your draft does not need changing.",
      };
    case "alias_verification_failed":
      return {
        detail: "Your invitation was built, but we could not confirm the guest link went live.",
        draftCanFix: false,
        nextStep: "Publish again. Nothing in your draft caused this.",
      };
    case "artifact_conflict":
      return {
        detail: "This publication no longer matches the draft it was built from.",
        draftCanFix: true,
        nextStep: "Make any small edit so the draft saves, then publish again.",
      };
    case "publication_stalled":
      return {
        detail: "Publishing was requested but never started.",
        draftCanFix: false,
        nextStep:
          "Publish again. If it still does not start, the delay is on our side, not in your invitation.",
      };
    default:
      return {
        detail: "Publishing stopped before your invitation went live.",
        draftCanFix: false,
        nextStep:
          "Publish again. If it fails a second time, the problem is on our side, not in your details.",
      };
  }
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
  const [isStatusCheckPending, setIsStatusCheckPending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publication, setPublication] = useState(initialPublication);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const statusRequestInFlightRef = useRef(false);
  const isCurrentRevisionLive =
    publication.status === "delivered" && publication.publishedRevision === revision;
  const isProcessing = publication.status === "publishing" || publication.status === "retrying";
  const problem = publicationProblem(publication.errorCode);

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
      timer = window.setTimeout(
        () => {
          timer = undefined;
          void pollPublication();
        },
        completedPolls === 0 ? FIRST_STATUS_POLL_MS : STATUS_POLL_MS,
      );
    };

    const pollPublication = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      if (statusRequestInFlightRef.current) {
        schedulePoll();
        return;
      }

      completedPolls += 1;
      statusRequestInFlightRef.current = true;
      setIsStatusCheckPending(true);

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
      } finally {
        statusRequestInFlightRef.current = false;
        setIsStatusCheckPending(false);
      }

      if (cancelled) return;
      if (completedPolls >= MAX_STATUS_POLLS) {
        setActionMessage(
          "Publishing is taking longer than expected. Your saved draft is safe. Check the latest status below, or come back to this page in a few minutes.",
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

  async function checkLatestStatus() {
    if (statusRequestInFlightRef.current) return;

    statusRequestInFlightRef.current = true;
    setIsStatusCheckPending(true);
    try {
      const result = await loadInvitationPublicationStatusAction({ invitationId });
      if (result.status === "error") {
        setActionMessage(result.message);
        return;
      }

      setPublication(result.publication);
      const stillProcessing =
        result.publication.status === "publishing" || result.publication.status === "retrying";
      setActionMessage(
        stillProcessing
          ? "Publishing is still underway. Your saved draft is safe; check again in a moment."
          : null,
      );
    } catch {
      setActionMessage(
        "Publication status is temporarily unavailable. Your saved draft is safe; try again.",
      );
    } finally {
      statusRequestInFlightRef.current = false;
      setIsStatusCheckPending(false);
    }
  }

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
  const showStatusCheck = isProcessing && actionMessage !== null;

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
          <div className={styles.failureDetail} data-draft-can-fix={problem.draftCanFix}>
            <p>{problem.detail}</p>
            <p>{problem.nextStep}</p>
            <p>Nothing new went live, and your saved draft is safe.</p>
          </div>
        ) : null}
        {actionMessage ? <p role="alert">{actionMessage}</p> : null}
        {publication.livePublicIdentifier && !isCurrentRevisionLive ? (
          <p>Your previous published revision remains live while this update is prepared.</p>
        ) : null}
        {showStatusCheck ? (
          <button
            aria-busy={isStatusCheckPending}
            className={styles.statusCheckButton}
            disabled={isStatusCheckPending}
            onClick={() => void checkLatestStatus()}
            type="button"
          >
            {isStatusCheckPending ? "Checking status…" : "Check latest status"}
          </button>
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
        aria-busy={isSubmitting || isProcessing}
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
