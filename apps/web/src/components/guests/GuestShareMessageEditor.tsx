"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { saveInvitationShareMessagesAction } from "../../server/guests/actions";
import type { GuestInvitationSummary } from "../../server/guests/guests";
import {
  buildGeneralInvitationMessage,
  buildPersonalInvitationMessage,
} from "../../server/guests/sharing";
import { Close } from "../Icons";
import styles from "./GuestDesk.module.css";

interface GuestShareMessageEditorProps {
  invitation: GuestInvitationSummary;
  onClose: () => void;
  /** `cleared` is true when both fields were emptied, restoring Invitica's own wording. */
  onSaved: (cleared: boolean) => void;
  personalOnly?: boolean;
}

/** Stand-in used only for the preview, so a creator sees a real message before saving. */
const PREVIEW_RECIPIENT = "Ninang Anika";

function previewOf(
  invitation: GuestInvitationSummary,
  personal: string,
  general: string,
): { general: string; personal: string } {
  const draft = {
    ...invitation,
    generalShareMessage: general.trim() || null,
    personalShareMessage: personal.trim() || null,
  };
  return {
    general: buildGeneralInvitationMessage(draft, invitation.genericUrl),
    personal: buildPersonalInvitationMessage(
      draft,
      PREVIEW_RECIPIENT,
      `${invitation.genericUrl}#g=example-guest-token`,
    ),
  };
}

export function GuestShareMessageEditor({
  invitation,
  onClose,
  onSaved,
  personalOnly = false,
}: GuestShareMessageEditorProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const [personal, setPersonal] = useState(invitation.personalShareMessage ?? "");
  const [general, setGeneral] = useState(invitation.generalShareMessage ?? "");
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), textarea:not([disabled])",
        ) ?? [],
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
  }, [isPending, onClose]);

  const preview = previewOf(invitation, personal, general);
  // The general link opens the invitation for reading and cannot authorize a party RSVP, so a
  // custom message that asks for one would promise something the link cannot deliver. Worth
  // saying out loud, not worth blocking: it is the creator's message.
  const generalPromisesReply = /\brsvp\b|\breply\b|\brespond\b/i.test(general);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setMessage(null);
    let saved = false;
    try {
      const result = await saveInvitationShareMessagesAction({
        general: personalOnly ? (invitation.generalShareMessage ?? "") : general,
        invitationId: invitation.invitationId,
        personal,
      });
      if (result.status === "error") {
        // The editor stays open on failure so the creator never loses what they wrote.
        setMessage(result.message);
        return;
      }
      saved = true;
    } catch {
      setMessage(
        "Invitica could not save this message. Your wording is still here — check your connection and try again.",
      );
    } finally {
      setIsPending(false);
    }
    if (saved) onSaved(!personal.trim() && (personalOnly || !general.trim()));
  }

  return (
    <div className={styles.backdrop}>
      <section
        aria-describedby="share-message-description"
        aria-labelledby="share-message-title"
        aria-modal="true"
        className={`${styles.dialog} ${styles.editDialog}`}
        ref={dialogRef}
        role="dialog"
      >
        <header className={styles.dialogHeader}>
          <div>
            <p className={styles.eyebrow}>Invitation message</p>
            <h2 id="share-message-title">Write your own message</h2>
            <p id="share-message-description">
              {personalOnly
                ? "Leave this message empty to use Invitica's personal wording."
                : "Leave a message empty to use Invitica's wording for it."}
            </p>
          </div>
          <button
            aria-label="Close invitation message editor"
            className={styles.modalClose}
            disabled={isPending}
            onClick={onClose}
            type="button"
          >
            <Close />
          </button>
        </header>

        <form
          aria-busy={isPending || undefined}
          className={styles.editPartyForm}
          onSubmit={(event) => void submit(event)}
        >
          {/*
            The label wraps nothing here: a hint inside a <label> becomes part of the field's
            accessible name, so screen-reader users would hear the whole placeholder list every
            time they reached the box. It is a description instead.
          */}
          <div className={styles.shareMessageField}>
            <label htmlFor="personal-share-message">Personal message, for one guest party</label>
            <textarea
              aria-describedby="personal-share-message-hint"
              disabled={isPending}
              id="personal-share-message"
              maxLength={2000}
              onChange={(event) => setPersonal(event.currentTarget.value)}
              placeholder="Hi, {recipient} — we're happy to share {celebrant}'s {occasion} invitation with you. {link}"
              ref={firstFieldRef}
              rows={6}
              value={personal}
            />
            <small id="personal-share-message-hint">
              Placeholders: <code>{"{recipient}"}</code> <code>{"{celebrant}"}</code>{" "}
              <code>{"{occasion}"}</code> <code>{"{link}"}</code>. Keep <code>{"{link}"}</code> so
              guests can open the invitation.
            </small>
          </div>

          {!personalOnly ? (
            <div className={styles.shareMessageField}>
              <label htmlFor="general-share-message">
                General message, for sharing with everyone
              </label>
              <textarea
                aria-describedby="general-share-message-hint"
                disabled={isPending}
                id="general-share-message"
                maxLength={2000}
                onChange={(event) => setGeneral(event.currentTarget.value)}
                placeholder="Dear, Family & Friends — we're happy to share {celebrant}'s {occasion} invitation with you. {link}"
                rows={6}
                value={general}
              />
              <small id="general-share-message-hint">
                Placeholders: <code>{"{celebrant}"}</code> <code>{"{occasion}"}</code>{" "}
                <code>{"{link}"}</code>. This message goes to everyone at once, so it has no{" "}
                <code>{"{recipient}"}</code>.
              </small>
              {generalPromisesReply ? (
                <small className={styles.shareMessageWarning} role="status">
                  The general link opens the invitation for reading but cannot accept an RSVP.
                  Guests who reply from it will not be recorded.
                </small>
              ) : null}
            </div>
          ) : null}

          <div className={styles.shareMessagePreview}>
            <p className={styles.eyebrow}>Preview</p>
            <h3>Personal</h3>
            <pre>{preview.personal}</pre>
            {!personalOnly ? (
              <>
                <h3>General</h3>
                <pre>{preview.general}</pre>
              </>
            ) : null}
          </div>

          {/* Only ever a failure: a success closes the editor and is confirmed on the desk. */}
          {message ? (
            <p className={styles.dialogStatus} role="alert">
              {message}
            </p>
          ) : null}
          <div className={styles.dialogActions}>
            <button
              disabled={isPending || (!personal && (personalOnly || !general))}
              onClick={() => {
                setPersonal("");
                if (!personalOnly) setGeneral("");
                setMessage(null);
              }}
              type="button"
            >
              Reset to default
            </button>
            <button disabled={isPending} onClick={onClose} type="button">
              Cancel
            </button>
            <button disabled={isPending} type="submit">
              {isPending ? "Saving..." : "Save message"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
