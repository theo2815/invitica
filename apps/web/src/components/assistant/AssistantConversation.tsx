"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";

import { MAX_MESSAGE_CHARACTERS } from "../../contracts/assistant-api";
import { useDraftFlush } from "../invitations/DraftFlushProvider";
import styles from "./Assistant.module.css";
import { useAssistant } from "./AssistantProvider";

const HELP_SUGGESTIONS = [
  "How do I send personalized links?",
  "Why can't my guest see the reply form?",
  "What happens when I publish an update?",
];

/**
 * Written the way a creator actually describes an event — one run-on sentence with the facts
 * in it — rather than as well-formed commands. They are examples of what to say, so a
 * polished imperative would teach the wrong thing.
 */
const DOCUMENT_SUGGESTIONS = [
  "Our wedding is on 12 December at 3pm, ceremony at San Agustin then reception at the Peninsula",
  "Add a programme: cocktails at 6, dinner 7, first dance 9",
  "Make the invitation message warmer and mention that it is a garden ceremony",
];

/**
 * Deliberately messy, and deliberately invented.
 *
 * They are examples of a list as it actually exists in a group chat — inconsistent counts,
 * terms of address, a family with a number after it — because a tidy example would teach a
 * creator to tidy their list first, which is the work this removes. No name here belongs to
 * anyone: fixtures never carry real guest data.
 */
const GUEST_SUGGESTIONS = [
  "Tita Baby +2, Kuya Jun & Ate Mae, Santos family (5), Ninong Ramon",
  "The Reyes family is 6, not 4",
];

/**
 * The thread and its composer. One component, rendered by both the floating widget and
 * `/dashboard/assistant`, so the two cannot drift into two different chat surfaces.
 */
export function AssistantConversation({ autoFocus = false }: { autoFocus?: boolean }) {
  const { clear, close, guestList, invitationId, messages, mode, notice, send, setMode, status } =
    useAssistant();
  const router = useRouter();
  const flushDraft = useDraftFlush();
  const [draft, setDraft] = useState("");
  const [leaving, setLeaving] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const isAnswering = status === "answering";
  // The newest text, which grows by a chunk at a time while an answer streams.
  const latest = messages.at(-1)?.content ?? "";

  useEffect(() => {
    if (autoFocus) composerRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    // Follows the answer as it streams, so the newest line stays visible without the creator
    // scrolling. `block: "nearest"` keeps that scroll inside the thread rather than dragging
    // the whole dashboard along behind the panel.
    if (latest) logEndRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [latest]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || isAnswering) return;
    void send(draft);
    setDraft("");
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line. A creator writing a two-line question on a
    // phone keyboard still has a way to do it.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit(event);
    }
  }

  /**
   * Hands the parsed rows to the Guest Desk, which is the only place they can be created.
   *
   * The rows live in the creator shell, which outlives this route, so nothing about them is
   * serialized through the URL or storage to survive the trip — the composer reads the same
   * object on the other side. The flush is the same one **Open full view** performs, and for
   * the same reason: a draft mid-save elsewhere settles before the navigation rather than
   * being abandoned by it.
   */
  async function reviewInGuestDesk() {
    if (leaving) return;
    setLeaving(true);
    try {
      await flushDraft();
      close();
      router.push("/dashboard/guests");
    } finally {
      setLeaving(false);
    }
  }

  const remaining = MAX_MESSAGE_CHARACTERS - draft.length;
  const drafting = mode === "document";
  const organizing = mode === "guests";
  // Both drafting and organizing need an invitation to work against. Off an editor, and
  // before a creator has picked one, there is nothing to offer — so the choice is not shown
  // rather than shown and refused.
  const canDraft = invitationId !== null;
  const suggestions = organizing
    ? GUEST_SUGGESTIONS
    : drafting
      ? DOCUMENT_SUGGESTIONS
      : HELP_SUGGESTIONS;
  const parsedParties = guestList?.invitationId === invitationId ? guestList.parties : null;

  return (
    <div className={styles.conversation}>
      {canDraft ? (
        <fieldset className={styles.modeSwitch}>
          <legend className={styles.visuallyHidden}>What Tala should do</legend>
          <button
            aria-pressed={!drafting}
            disabled={isAnswering}
            onClick={() => setMode("help")}
            type="button"
          >
            Answer a question
          </button>
          <button
            aria-pressed={drafting}
            disabled={isAnswering}
            onClick={() => setMode("document")}
            type="button"
          >
            Draft my invitation
          </button>
          <button
            aria-pressed={organizing}
            disabled={isAnswering}
            onClick={() => setMode("guests")}
            type="button"
          >
            Organize my guest list
          </button>
        </fieldset>
      ) : null}

      <div className={styles.log}>
        {messages.length === 0 && !notice ? (
          <div className={styles.empty}>
            <p className={styles.emptyLead}>
              {organizing
                ? "Paste your guest list however it already exists and Tala sorts it into invitations. You check every row in the Guest Desk first — nothing is created until you do. Their names are sent to Invitica's AI provider to be read."
                : drafting
                  ? "Describe your event and Tala drafts it into your invitation. You see the draft first and decide whether to keep it — nothing is saved until you do."
                  : "Ask Tala how anything in Invitica works. Answers come from Invitica's own help material, and Tala never changes your invitations."}
            </p>
            <ul className={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    className={styles.suggestion}
                    disabled={isAnswering}
                    onClick={() => void send(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ol className={styles.messages}>
          {messages.map((message, index) => (
            <li
              className={styles.message}
              data-role={message.role}
              // Messages are append-only and never reordered, so the position is a stable
              // identity. Their text is not: an answer's content changes on every streamed
              // chunk, which would remount the node on each token if it were the key.
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only, never reordered
              key={index}
            >
              <span className={styles.messageRole}>{message.role === "user" ? "You" : "Tala"}</span>
              <p className={styles.messageBody}>{message.content}</p>
            </li>
          ))}
        </ol>

        {notice ? (
          <p className={styles.notice} role="alert">
            {notice}
          </p>
        ) : null}

        {organizing && parsedParties ? (
          <section aria-labelledby="assistant-guest-list" className={styles.guestList}>
            <h3 className={styles.guestListHeading} id="assistant-guest-list">
              {parsedParties.length === 1
                ? "1 invitation, not created yet"
                : `${parsedParties.length} invitations, not created yet`}
            </h3>
            <ul className={styles.guestRows}>
              {parsedParties.map((party, index) => (
                // Two rows may legitimately carry the same name — a creator with two guests
                // called Tita Baby is not an error — so the position is the only stable
                // identity here. The list is replaced whole and never reordered.
                <li key={index}>
                  <span>{party.internalLabel}</span>
                  <span>
                    {party.capacity === 1 ? "1 seat" : `${party.capacity} seats`}
                    {party.guestNames.length > 0 ? ` · ${party.guestNames.join(", ")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.guestListActions}>
              <button
                className={styles.review}
                disabled={leaving}
                onClick={() => void reviewInGuestDesk()}
                type="button"
              >
                {leaving ? "Opening…" : "Review in Guest Desk"}
              </button>
            </div>
          </section>
        ) : null}

        {/* The answer itself is not announced token by token — that would read every
            fragment aloud. One polite status per turn is the useful amount. A draft has no
            streamed text at all, so this status is the only signal that it is working. */}
        <p aria-live="polite" className={styles.visuallyHidden}>
          {isAnswering
            ? organizing
              ? "Tala is organizing your guest list."
              : drafting
                ? "Tala is drafting your invitation."
                : "Tala is answering."
            : ""}
        </p>

        <div ref={logEndRef} />
      </div>

      <form className={styles.composer} onSubmit={submit}>
        <label className={styles.visuallyHidden} htmlFor="assistant-composer">
          {organizing ? "Paste your guest list" : drafting ? "Describe your event" : "Ask Tala"}
        </label>
        <textarea
          className={styles.input}
          disabled={isAnswering}
          id="assistant-composer"
          maxLength={MAX_MESSAGE_CHARACTERS}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={
            organizing
              ? "Paste your guest list…"
              : drafting
                ? "Describe your event…"
                : "Ask how something works…"
          }
          ref={composerRef}
          // A pasted list is many lines where a question is one or two, so it gets room to
          // be read back before it is sent.
          rows={organizing ? 4 : 2}
          value={draft}
        />
        <div className={styles.composerActions}>
          {messages.length > 0 ? (
            <button
              className={styles.secondaryAction}
              disabled={isAnswering}
              onClick={clear}
              type="button"
            >
              Start over
            </button>
          ) : (
            <span />
          )}
          {/* Only shown near the limit. A counter that is always on is noise. */}
          <span aria-hidden={remaining > 200} className={styles.counter}>
            {remaining <= 200 ? `${remaining} characters left` : ""}
          </span>
          <button
            className={styles.sendAction}
            disabled={isAnswering || draft.trim().length === 0}
            type="submit"
          >
            {isAnswering
              ? organizing
                ? "Organizing…"
                : drafting
                  ? "Drafting…"
                  : "Answering…"
              : organizing
                ? "Organize"
                : drafting
                  ? "Draft"
                  : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}
