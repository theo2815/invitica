"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  ASSISTANT_MODE_LABELS,
  type AssistantMode,
  MAX_MESSAGE_CHARACTERS,
} from "../../contracts/assistant-api";
import { suggestMode } from "../../lib/assistant/mode-routing";
import { useDraftFlush } from "../invitations/DraftFlushProvider";
import styles from "./Assistant.module.css";
import { AssistantAnswer } from "./AssistantAnswer";
import { AssistantHistory } from "./AssistantHistory";
import { useAssistant } from "./AssistantProvider";
import { AssistantUsageLine } from "./AssistantUsage";
import { TalaMascot } from "./TalaMascot";

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

/** Roughly six lines before the composer stops growing and starts scrolling. */
const MAX_COMPOSER_HEIGHT = 176;

/** Close enough to the newest line that following the answer is what the creator wants. */
const FOLLOW_THRESHOLD = 120;

/**
 * The thread and its composer. One component, rendered by both the floating widget and
 * `/dashboard/assistant`, so the two cannot drift into two different chat surfaces.
 */
export function AssistantConversation({ autoFocus = false }: { autoFocus?: boolean }) {
  const {
    abilities,
    close,
    conversations,
    editLastMessage,
    guestList,
    invitationId,
    messages,
    mode,
    notice,
    refreshConversations,
    send,
    setMode,
    startNewConversation,
    status,
    stop,
    stopped,
  } = useAssistant();
  const router = useRouter();
  const flushDraft = useDraftFlush();
  const [draft, setDraft] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<null | number>(null);
  /**
   * The tab a creator has already said no to for what they are typing.
   *
   * Held per tab rather than as one boolean, so dismissing a drafting suggestion does not
   * silence a guest-list one about a different sentence later in the same message.
   */
  const [dismissedMode, setDismissedMode] = useState<null | AssistantMode>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const isAnswering = status === "answering";
  // The newest text, which grows by a chunk at a time while an answer streams.
  const latest = messages.at(-1)?.content ?? "";

  useEffect(() => {
    if (autoFocus) composerRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const log = logRef.current;
    if (!latest || !log) return;

    // Follows the answer as it streams — but only while the creator is already at the
    // bottom. Scrolling up to re-read an earlier answer used to be undone by the next
    // chunk, which made a long answer impossible to read until it finished.
    const distanceFromBottom = log.scrollHeight - log.scrollTop - log.clientHeight;
    if (distanceFromBottom > FOLLOW_THRESHOLD) return;

    // `block: "nearest"` keeps that scroll inside the thread rather than dragging the
    // whole dashboard along behind the panel.
    logEndRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [latest]);

  useEffect(() => {
    const node = composerRef.current;
    // jsdom reports no layout, and a height of zero would be worse than the default rows.
    if (!node || node.scrollHeight === 0) return;

    // Grows with what is typed rather than staying two lines and scrolling inside itself,
    // which on a phone hides most of a guest list while it is being checked. Cleared back
    // to the default rows once the message is sent.
    node.style.height = "auto";
    node.style.height =
      draft.length === 0 ? "" : `${Math.min(node.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, [draft]);

  useEffect(() => {
    if (copiedIndex === null) return;
    const timer = window.setTimeout(() => setCopiedIndex(null), 2_000);
    return () => window.clearTimeout(timer);
  }, [copiedIndex]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || isAnswering) return;
    void send(draft);
    setDraft("");
    // The dismissal belonged to the message that has now gone. The next one starts fresh.
    setDismissedMode(null);
  }

  /**
   * Takes the suggestion: changes what the next message does, and leaves what is typed alone.
   *
   * Not sending it. The creator wrote the message, so the creator sends it — and they may well
   * want to add to it now that it is going somewhere else.
   */
  function switchTo(to: AssistantMode) {
    setMode(to);
    setDismissedMode(null);
    composerRef.current?.focus();
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
   * Puts the creator's last message back in the composer for them to finish.
   *
   * The pair of this and **Stop** is the way out of a question sent by accident: stop the
   * answer to a half-typed question, take the question back, complete it, send it again —
   * all inside the conversation that was already going, rather than beside it.
   */
  function editLast() {
    const text = editLastMessage();
    if (text === null) return;
    setDraft(text);
    composerRef.current?.focus();
  }

  async function copyAnswer(index: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
    } catch {
      // No clipboard permission, or an insecure origin. The answer is on screen and can
      // still be selected, so there is nothing worth interrupting the creator with.
    }
  }

  function toggleHistory() {
    const opening = !showHistory;
    setShowHistory(opening);
    // Loaded when the list is asked for rather than on mount, so a creator who never opens
    // it never spends the round trip.
    if (opening) void refreshConversations();
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

  /**
   * What this surface can actually do with the invitation it has, if any.
   *
   * Drafting needs the shared section-document editor; organizing needs a published
   * invitation. Whoever put the invitation in context stated both, and both default to
   * false, so an unset surface offers neither.
   */
  const canDraft = invitationId !== null && abilities.canDraft;
  const canOrganize = invitationId !== null && abilities.canOrganize;

  /**
   * The mode that is really in force, which is not always the one that was chosen.
   *
   * Mode survives navigation and the invitation does not, so a creator who left the Guest
   * Desk in organizing mode used to arrive on the next route with the composer still
   * labelled "Paste your guest list" while `send` quietly routed the message to the help
   * endpoint — a guest list pasted into a box that named it, answered as a question. The
   * provider now resets the mode when its invitation goes away; this is the same rule
   * applied again at the point of rendering, so no future caller can reopen the gap.
   */
  const effectiveMode: AssistantMode =
    (mode === "document" && !canDraft) || (mode === "guests" && !canOrganize) ? "help" : mode;
  const drafting = effectiveMode === "document";
  const organizing = effectiveMode === "guests";

  /**
   * Why a tab is unavailable, in one line under the switch.
   *
   * The tabs are shown everywhere now, so this is the difference between a control that
   * looks broken and one a creator knows how to unlock. Silent when everything is
   * available, because there is nothing to explain.
   *
   * Kept to one line at 390 px. Measured: this sits above the thread on the mobile sheet at
   * all times, so every line it wraps to is a line of conversation the creator loses.
   */
  const modeHint =
    !canDraft && !canOrganize
      ? "Open an invitation to draft or organize."
      : !canDraft
        ? "Drafting needs this invitation's own editor."
        : !canOrganize
          ? "Organizing needs a published invitation."
          : null;

  /**
   * Which tab what they are typing belongs in, if it is plainly not this one.
   *
   * Run on the composer rather than on the answer, which is the whole point: the creator is
   * offered the right tab **before** the message is spent. It is a regular expression over at
   * most two thousand characters, so it costs nothing to run on every keystroke and nothing to
   * be wrong about.
   */
  const suggestion = useMemo(
    () =>
      suggestMode({
        canDraft: abilities.canDraft,
        canOrganize: abilities.canOrganize,
        mode,
        text: draft,
      }),
    [abilities.canDraft, abilities.canOrganize, draft, mode],
  );

  // Hidden while an answer runs, because the mode buttons are disabled then and an offer that
  // cannot be taken is just noise.
  const offered = suggestion && suggestion.to !== dismissedMode && !isAnswering ? suggestion : null;
  const suggestions = organizing
    ? GUEST_SUGGESTIONS
    : drafting
      ? DOCUMENT_SUGGESTIONS
      : HELP_SUGGESTIONS;
  const parsedParties = guestList?.invitationId === invitationId ? guestList.parties : null;
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  // Between sending and the first token there is no assistant message at all, so this is
  // what stands in for one. Previously an empty message was pushed instead, and an empty
  // bubble with a border rendered as a bare horizontal line.
  const isThinking = isAnswering && messages.at(-1)?.role !== "assistant";
  const workingLabel = organizing
    ? "Tala is reading your list"
    : drafting
      ? "Tala is drafting your invitation"
      : "Tala is thinking";

  return (
    <div className={styles.conversation}>
      <div className={styles.threadBar}>
        <button
          className={styles.threadAction}
          disabled={isAnswering || (messages.length === 0 && !showHistory)}
          onClick={() => {
            setShowHistory(false);
            startNewConversation();
          }}
          type="button"
        >
          New chat
        </button>
        <button
          aria-expanded={showHistory}
          className={styles.threadAction}
          data-active={showHistory}
          onClick={toggleHistory}
          type="button"
        >
          {showHistory
            ? "Back to chat"
            : conversations.length > 0
              ? `History (${conversations.length})`
              : "History"}
        </button>
      </div>

      {/*
        Shown on every surface, not only where all three work.

        Hiding the switch until an invitation was in context meant a creator on Overview,
        Templates, or Invitations saw no evidence Tala did anything but answer questions —
        two of its three jobs were invisible on the routes a new creator spends their first
        session in. Unavailable tabs are disabled and the line underneath says what unlocks
        them, which is the honest version of the same information: the capability exists,
        here is how to reach it. Nothing is offered that would then refuse.
      */}
      {showHistory ? null : (
        <div className={styles.modeGroup}>
          <fieldset className={styles.modeSwitch}>
            <legend className={styles.visuallyHidden}>What Tala should do</legend>
            <button
              aria-pressed={!drafting && !organizing}
              disabled={isAnswering}
              onClick={() => setMode("help")}
              type="button"
            >
              {ASSISTANT_MODE_LABELS.help}
            </button>
            <button
              aria-pressed={drafting}
              disabled={isAnswering || !canDraft}
              onClick={() => setMode("document")}
              type="button"
            >
              {ASSISTANT_MODE_LABELS.document}
            </button>
            <button
              aria-pressed={organizing}
              disabled={isAnswering || !canOrganize}
              onClick={() => setMode("guests")}
              type="button"
            >
              {ASSISTANT_MODE_LABELS.guests}
            </button>
          </fieldset>

          {modeHint ? <p className={styles.modeHint}>{modeHint}</p> : null}
        </div>
      )}

      {showHistory ? (
        <div className={styles.log}>
          <AssistantHistory onOpened={() => setShowHistory(false)} />
        </div>
      ) : (
        <div className={styles.log} ref={logRef}>
          {messages.length === 0 && !notice ? (
            <div className={styles.empty}>
              <p className={styles.emptyLead}>
                {organizing
                  ? "Paste your guest list however it already exists and Tala sorts it into invitations. You check every row in the Guest Desk first — nothing is created until you do. Their names are sent to Invitica's AI provider to be read, and this conversation is saved to your history until you delete it."
                  : drafting
                    ? "Describe your event and Tala drafts it into your invitation. You see the draft first and decide whether to keep it — nothing is saved until you do."
                    : "Ask Tala how anything in Invitica works. Answers come from Invitica's own help material, and Tala never changes your invitations."}
              </p>
              {/*
                These fill the composer; they no longer send.

                Sending on one tap spent a message from a twenty-message day on a question
                the creator had not finished reading, with no way back except Stop and
                Edit. Filling the composer is the same rule the mode-routing offer already
                follows — it changes what is about to happen and leaves the sending to the
                person. It also turns each one into a starting point they can adjust, which
                is what an example of how to phrase a request is for.
              */}
              <p className={styles.suggestionsLead}>
                Pick one to put it in the box below, then edit it before you send.
              </p>
              <ul className={styles.suggestions}>
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      className={styles.suggestion}
                      disabled={isAnswering}
                      onClick={() => {
                        setDraft(suggestion);
                        composerRef.current?.focus();
                      }}
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
                // Messages are append-only within a turn and never reordered, so the
                // position is a stable identity. Their text is not: an answer's content
                // changes on every streamed chunk, which would remount the node on each
                // token if it were the key.
                key={index}
              >
                <span className={styles.messageRole}>
                  {message.role === "user" ? "You" : "Tala"}
                </span>

                {message.role === "assistant" ? (
                  <div className={styles.messageBody}>
                    <AssistantAnswer text={message.content} />
                  </div>
                ) : (
                  <p className={styles.messageBody}>{message.content}</p>
                )}

                {message.role === "assistant" && !isAnswering ? (
                  <button
                    className={styles.messageAction}
                    onClick={() => void copyAnswer(index, message.content)}
                    type="button"
                  >
                    {copiedIndex === index ? "Copied" : "Copy"}
                  </button>
                ) : null}

                {message.role === "user" && index === lastUserIndex && !isAnswering ? (
                  <button className={styles.messageAction} onClick={editLast} type="button">
                    Edit
                  </button>
                ) : null}
              </li>
            ))}
          </ol>

          {isThinking ? (
            <div className={styles.thinking}>
              <TalaMascot className={styles.thinkingMascot} size="compact" state="thinking" />
              <span className={styles.thinkingLabel}>
                {workingLabel}
                <span aria-hidden="true" className={styles.thinkingDots}>
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            </div>
          ) : null}

          {stopped && !isAnswering ? (
            <p className={styles.stopped}>
              You stopped this answer. That message still counted towards today&apos;s allowance —
              edit your question above and send it again when you are ready.
            </p>
          ) : null}

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
                  // Two rows may legitimately carry the same name — a creator with two
                  // guests called Tita Baby is not an error — so the position is the only
                  // stable identity here. The list is replaced whole and never reordered.
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
              fragment aloud. One polite status per turn is the useful amount. A draft has
              no streamed text at all, so this status is the only signal that it is
              working. */}
          <p aria-live="polite" className={styles.visuallyHidden}>
            {isAnswering ? `${workingLabel}.` : ""}
          </p>

          <div ref={logEndRef} />
        </div>
      )}

      {offered && !showHistory ? (
        /* Polite rather than assertive, and the text only changes when the suggested tab
           does — so it is announced once per suggestion rather than once per keystroke. */
        <div className={styles.routing} role="status">
          <p className={styles.routingReason}>{offered.reason}</p>
          <div className={styles.routingActions}>
            <button
              className={styles.routingSwitch}
              onClick={() => switchTo(offered.to)}
              type="button"
            >
              Switch to {ASSISTANT_MODE_LABELS[offered.to]}
            </button>
            <button onClick={() => setDismissedMode(offered.to)} type="button">
              Not now
            </button>
          </div>
        </div>
      ) : null}

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
          // A pasted list is many lines where a question is one or two, so it starts with
          // room to be read back before it is sent. It grows from there as one is typed.
          rows={organizing ? 4 : 2}
          value={draft}
        />
        <div className={styles.composerActions}>
          {/*
            One slot, two things that are never both urgent. The character counter appears
            only within 200 characters of the limit and takes the slot when it does: a
            message about to be cut short matters more right now than how many are left
            today. The rest of the time the day's allowance sits here, which costs the panel
            no height at all — this row already existed.
          */}
          {remaining <= 200 ? (
            <span className={styles.counter}>{remaining} characters left</span>
          ) : (
            <AssistantUsageLine />
          )}

          {isAnswering ? (
            <button className={styles.stopAction} onClick={stop} type="button">
              Stop
            </button>
          ) : (
            <button
              className={styles.sendAction}
              disabled={draft.trim().length === 0}
              type="submit"
            >
              {organizing ? "Organize" : drafting ? "Draft" : "Ask"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
