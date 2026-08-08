"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import {
  type AssistantApiMessage,
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
import { type InviPanelStatus, InviTaskPanel } from "../assistant/InviTaskPanel";
import { requestShareMessages } from "../assistant/message-writing";
import { DiscardChangesDialog } from "../feedback/DiscardChangesDialog";
import { Close } from "../Icons";
import styles from "./GuestDesk.module.css";

interface GuestShareMessageEditorProps {
  /** False when `ASSISTANT_ENABLED` is off or no key is configured. Hides the Invi path only. */
  assistantAvailable?: boolean;
  invitation: GuestInvitationSummary;
  onClose: () => void;
  /** `cleared` is true when both fields were emptied, restoring Invitica's own wording. */
  onSaved: (cleared: boolean) => void;
  personalOnly?: boolean;
}

/** Stand-in used only for the preview, so a creator sees a real message before saving. */
const PREVIEW_RECIPIENT = "Ninang Anika";

/**
 * Examples of how to ask, written the way a creator would say it out loud rather than as
 * well-formed commands. Offered only before anything has been said, and they fill the box.
 */
const MESSAGE_SUGGESTIONS = [
  "Warm but short, and call them by their nickname",
  "Mention that it is a garden ceremony and that the reception follows",
];

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
  const [confirmingClose, setConfirmingClose] = useState(false);
  /**
   * What Invi has to say about the last turn, beside the box it was typed into.
   *
   * Separate from `message`, which is only ever a failed save. Sharing one line meant a
   * clarifying question rendered through `.dialogStatus` — unconditionally `--danger` — so
   * an ordinary question arrived looking like an error.
   */
  const [inviStatus, setInviStatus] = useState<InviPanelStatus | null>(null);
  /**
   * The exchange with Invi inside this dialog.
   *
   * Local, and deliberately not the floating panel's thread: this conversation is about two
   * fields on this screen, it ends when the dialog closes, and it is not saved to history.
   */
  const [thread, setThread] = useState<AssistantApiMessage[]>([]);

  /**
   * Whether closing now would throw away wording.
   *
   * Compared against what the invitation actually held when this opened, so a creator who
   * opened the editor and changed nothing is never asked a question with no answer worth
   * giving.
   */
  const dirty =
    thread.length > 0 ||
    request.trim().length > 0 ||
    personal !== (invitation.personalShareMessage ?? "") ||
    (!personalOnly && general !== (invitation.generalShareMessage ?? ""));

  const requestClose = useCallback(() => {
    if (isPending || isWriting) return;
    if (dirty) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  }, [dirty, isPending, isWriting, onClose]);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // The discard question owns the keyboard while it is open, including this trap. Without
      // that, Tab from inside it walks back into the very form it is protecting.
      if (confirmingClose) return;
      // Closing mid-write would discard an answer that has already been billed, so the dialog
      // holds until it lands — the same rule the Add guests composer follows.
      if (event.key === "Escape" && !isPending && !isWriting) {
        event.preventDefault();
        requestClose();
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
    // `requestClose` carries the answer to "does closing lose anything?", and a stale closure
    // here would be a stale answer to the one question this dialog must not get wrong.
  }, [confirmingClose, isPending, isWriting, requestClose]);

  const preview = previewOf(invitation, personal, general);
  /**
   * What the box should say it is for, which is not the same as whether anything was sent.
   *
   * Wording on screen means the next message revises it. Questions with no wording yet mean
   * the next message answers them. A refused turn leaves the creator's own message in the
   * thread and nothing else — that is still a first request.
   */
  const written = personal.trim().length > 0 || general.trim().length > 0;
  const answeringQuestions = !written && thread.at(-1)?.role === "assistant";
  // The general link opens the invitation for reading and cannot authorize a party RSVP, so a
  // custom message that asks for one would promise something the link cannot deliver. Worth
  // saying out loud, not worth blocking: it is the creator's message.
  const generalPromisesReply = /\brsvp\b|\breply\b|\brespond\b/i.test(general);

  /**
   * Asks Invi for wording and puts what comes back into the fields.
   *
   * The fields as they stand go with the request, so "make it shorter" shortens what is on
   * screen — which may be Invi's last answer, the creator's edit of it, or wording they saved
   * weeks ago. Without that the model would only ever be revising its own previous reply.
   *
   * A message Invi left alone is left alone here too, so asking about the personal wording
   * never quietly rewrites the general one. Nothing is saved: this fills the same fields the
   * creator types into, and their own Save is still the only thing that commits.
   *
   * One turn spends one message from the daily Invi allowance, the same as a question.
   */
  async function write() {
    const text = request.trim();
    if (!text || isWriting || isPending) return;

    const current = { general: general.trim() || null, personal: personal.trim() || null };
    const turn: AssistantApiMessage[] = [...thread, { content: text, role: "user" }];

    setThread(turn);
    setRequest("");
    setIsWriting(true);
    setInviStatus(null);
    setMessage(null);

    const result = await requestShareMessages(
      invitation.invitationId,
      shareMessageConversationPayload(turn, current),
    );

    if (result.status === "refused") {
      // The request stays in the thread so it can be read, and Try again puts it back in the
      // box — a refusal used to leave the creator's own words nowhere they could reach them.
      setInviStatus({ retry: () => setRequest(text), text: result.message, tone: "danger" });
      setIsWriting(false);
      return;
    }

    if (result.status === "questions") {
      setThread([
        ...turn,
        { content: shareMessageQuestionsMessage(result.questions), role: "assistant" },
      ]);
      setInviStatus({
        text: "Answer what you can and Invi will write it from there. Your wording is unchanged.",
        tone: "info",
      });
      setIsWriting(false);
      return;
    }

    const wrotePersonal = result.personal !== null;
    const wroteGeneral = !personalOnly && result.general !== null;
    if (result.personal !== null) setPersonal(result.personal);
    if (!personalOnly && result.general !== null) setGeneral(result.general);

    setThread([
      ...turn,
      { content: shareMessageWrittenMessage(result.questions), role: "assistant" },
    ]);
    // Names which field moved, because a message Invi was not asked about is left exactly as
    // it was — and two fields with one changed is not something a creator should have to spot.
    setInviStatus({
      text:
        wrotePersonal && wroteGeneral
          ? "Both messages are filled in below. Read them, then save when you are happy."
          : wroteGeneral
            ? "The general message is filled in below. Your personal message is unchanged."
            : wrotePersonal
              ? personalOnly
                ? "Your message is filled in below. Read it, then save when you are happy."
                : "The personal message is filled in below. Your general message is unchanged."
              : "Nothing changed. Try describing what you want in a little more detail.",
      tone: "info",
    });
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
            onClick={requestClose}
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
            <InviTaskPanel
              busy={isWriting}
              busyLabel="Invi is writing your message"
              className={styles.taskPanel}
              disabled={isPending}
              hint={
                written
                  ? "Invi can see what is in the fields, so say what to change — shorter, warmer, mention something in particular."
                  : answeringQuestions
                    ? "Answer what you can in one message. Invi writes it from there."
                    : "Say how you want it to sound and what it should mention. Invi fills the fields below and you edit or save it yourself — nothing is sent to anyone."
              }
              inputId="share-message-request"
              label={
                written
                  ? "Tell Invi what to change"
                  : answeringQuestions
                    ? "Answer Invi's questions"
                    : "Describe it and let Invi write it"
              }
              onChange={setRequest}
              onSend={() => void write()}
              placeholder={
                written
                  ? "Shorter, and mention that it is a garden ceremony"
                  : "Warm but short, and call them by their nickname"
              }
              sendLabel={written || answeringQuestions ? "Send to Invi" : "Write with Invi"}
              status={inviStatus}
              suggestions={written || answeringQuestions ? undefined : MESSAGE_SUGGESTIONS}
              thread={thread}
              value={request}
            />
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

          {/*
            Beside the fields it empties, not in the footer beside Save.

            At 430 px the footer stacks into a column, which put a control that clears both
            messages directly above the one that saves them — three full-width buttons where
            the destructive one came first.
          */}
          <div className={styles.shareMessageReset}>
            <button
              disabled={isPending || isWriting || (!personal && (personalOnly || !general))}
              onClick={() => {
                setPersonal("");
                if (!personalOnly) setGeneral("");
                setInviStatus(null);
                setMessage(null);
              }}
              type="button"
            >
              Reset to Invitica&apos;s wording
            </button>
          </div>

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
            <button disabled={isPending || isWriting} onClick={requestClose} type="button">
              Cancel
            </button>
            <button disabled={isPending || isWriting} type="submit">
              {isPending ? "Saving..." : "Save message"}
            </button>
          </div>
        </form>
      </section>

      {confirmingClose ? (
        <DiscardChangesDialog
          confirmLabel="Discard"
          description="Your wording and your conversation with Invi will be gone. The message guests get now stays as it is."
          eyebrow="Invitation message"
          onDiscard={() => {
            setConfirmingClose(false);
            onClose();
          }}
          onKeepEditing={() => setConfirmingClose(false)}
          title="Discard this message?"
        />
      ) : null}
    </div>
  );
}
