"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  type AssistantApiMessage,
  MAX_MESSAGE_CHARACTERS,
  shareMessageConversationPayload,
  shareMessageQuestionsMessage,
  shareMessageWrittenMessage,
} from "../../contracts/assistant-api";
import { saveInvitationShareMessagesAction } from "../../server/guests/actions";
import type { GuestInvitationSummary } from "../../server/guests/guests";
import {
  buildGeneralInvitationMessage,
  buildPersonalInvitationMessage,
} from "../../server/guests/sharing";
import { AssistantAnswer } from "../assistant/AssistantAnswer";
import { requestShareMessages } from "../assistant/message-writing";
import { Close } from "../Icons";
import styles from "./GuestDesk.module.css";

interface GuestShareMessageEditorProps {
  /** False when `ASSISTANT_ENABLED` is off or no key is configured. Hides the Tala path only. */
  assistantAvailable?: boolean;
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
  assistantAvailable = false,
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
  const [request, setRequest] = useState("");
  const [isWriting, setIsWriting] = useState(false);
  /**
   * The exchange with Tala inside this dialog.
   *
   * Local, and deliberately not the floating panel's thread: this conversation is about two
   * fields on this screen, it ends when the dialog closes, and it is not saved to history.
   */
  const [thread, setThread] = useState<AssistantApiMessage[]>([]);

  useEffect(() => {
    firstFieldRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      // Closing mid-write would discard an answer that has already been billed, so the dialog
      // holds until it lands — the same rule the Add guests composer follows.
      if (event.key === "Escape" && !isPending && !isWriting) {
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
  }, [isPending, isWriting, onClose]);

  const preview = previewOf(invitation, personal, general);
  // Whether there is already wording for a change to apply to — Tala's or the creator's own.
  // Either way the next message is a revision rather than a first request, and the box says so.
  const written = thread.length > 0 || personal.trim().length > 0 || general.trim().length > 0;
  // The general link opens the invitation for reading and cannot authorize a party RSVP, so a
  // custom message that asks for one would promise something the link cannot deliver. Worth
  // saying out loud, not worth blocking: it is the creator's message.
  const generalPromisesReply = /\brsvp\b|\breply\b|\brespond\b/i.test(general);

  /**
   * Asks Tala for wording and puts what comes back into the fields.
   *
   * The fields as they stand go with the request, so "make it shorter" shortens what is on
   * screen — which may be Tala's last answer, the creator's edit of it, or wording they saved
   * weeks ago. Without that the model would only ever be revising its own previous reply.
   *
   * A message Tala left alone is left alone here too, so asking about the personal wording
   * never quietly rewrites the general one. Nothing is saved: this fills the same fields the
   * creator types into, and their own Save is still the only thing that commits.
   *
   * One turn spends one message from the daily Tala allowance, the same as a question.
   */
  async function write() {
    const text = request.trim();
    if (!text || isWriting || isPending) return;

    const current = { general: general.trim() || null, personal: personal.trim() || null };
    const turn: AssistantApiMessage[] = [...thread, { content: text, role: "user" }];

    setThread(turn);
    setRequest("");
    setIsWriting(true);
    setMessage(null);

    const result = await requestShareMessages(
      invitation.invitationId,
      shareMessageConversationPayload(turn, current),
    );

    if (result.status === "refused") {
      // The request stays in the thread so it can be read and asked again, which is the rule
      // the floating panel already follows for a refused turn.
      setMessage(result.message);
      setIsWriting(false);
      return;
    }

    if (result.status === "questions") {
      setThread([
        ...turn,
        { content: shareMessageQuestionsMessage(result.questions), role: "assistant" },
      ]);
      setIsWriting(false);
      return;
    }

    if (result.personal !== null) setPersonal(result.personal);
    if (!personalOnly && result.general !== null) setGeneral(result.general);

    setThread([
      ...turn,
      { content: shareMessageWrittenMessage(result.questions), role: "assistant" },
    ]);
    setIsWriting(false);
  }

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
            disabled={isPending || isWriting}
            onClick={onClose}
            type="button"
          >
            <Close />
          </button>
        </header>

        <form
          aria-busy={isPending || isWriting || undefined}
          className={styles.editPartyForm}
          onSubmit={(event) => void submit(event)}
        >
          {assistantAvailable ? (
            <section className={styles.organizer}>
              <label htmlFor="share-message-request">
                <span>
                  {written ? "Tell Tala what to change" : "Describe it and let Tala write it"}
                </span>
                <small>
                  {written
                    ? "Tala can see what is in the fields, so say what to change — shorter, warmer, mention something in particular. Each message uses one of today's Tala messages."
                    : "Say how you want it to sound and what it should mention. Tala fills the fields below and you edit or save it yourself — nothing is sent to anyone."}
                </small>
              </label>

              {/*
                The exchange, not the wording.

                Tala's replies here are one sentence and any questions under it; the message
                itself goes into the fields and its preview, where a creator reads it against
                real invitation data rather than as a quotation inside a chat.
              */}
              {thread.length > 0 ? (
                <ol className={styles.organizerThread}>
                  {thread.map((entry, index) => (
                    // Append-only within this dialog and never reordered, so the position is a
                    // stable identity where the text is not.
                    <li data-role={entry.role} key={index}>
                      <span className={styles.organizerRole}>
                        {entry.role === "user" ? "You" : "Tala"}
                      </span>
                      {entry.role === "assistant" ? (
                        <AssistantAnswer text={entry.content} />
                      ) : (
                        <p>{entry.content}</p>
                      )}
                    </li>
                  ))}
                </ol>
              ) : null}

              <textarea
                disabled={isPending || isWriting}
                id="share-message-request"
                maxLength={MAX_MESSAGE_CHARACTERS}
                onChange={(event) => setRequest(event.target.value)}
                placeholder={
                  written
                    ? "Shorter, and mention that it is a garden ceremony"
                    : "Warm but short, and call them by their nickname"
                }
                rows={3}
                value={request}
              />
              <button
                className={styles.organizeAction}
                disabled={isPending || isWriting || request.trim().length === 0}
                onClick={() => void write()}
                type="button"
              >
                {isWriting ? "Writing…" : written ? "Send to Tala" : "Write with Tala"}
              </button>
            </section>
          ) : null}

          {/*
            The label wraps nothing here: a hint inside a <label> becomes part of the field's
            accessible name, so screen-reader users would hear the whole placeholder list every
            time they reached the box. It is a description instead.
          */}
          <div className={styles.shareMessageField}>
            <label htmlFor="personal-share-message">Personal message, for one guest party</label>
            <textarea
              aria-describedby="personal-share-message-hint"
              disabled={isPending || isWriting}
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
                disabled={isPending || isWriting}
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
              disabled={isPending || isWriting || (!personal && (personalOnly || !general))}
              onClick={() => {
                setPersonal("");
                if (!personalOnly) setGeneral("");
                setMessage(null);
              }}
              type="button"
            >
              Reset to default
            </button>
            <button disabled={isPending || isWriting} onClick={onClose} type="button">
              Cancel
            </button>
            <button disabled={isPending || isWriting} type="submit">
              {isPending ? "Saving..." : "Save message"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
