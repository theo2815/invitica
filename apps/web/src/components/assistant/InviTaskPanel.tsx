"use client";

import { type KeyboardEvent, useEffect } from "react";

import { type AssistantApiMessage, MAX_MESSAGE_CHARACTERS } from "../../contracts/assistant-api";
import { AssistantAnswer } from "./AssistantAnswer";
import { useOptionalAssistant } from "./AssistantProvider";
import { AssistantUsageLine } from "./AssistantUsage";
import { InviMascot, type InviState } from "./InviMascot";
import styles from "./InviTaskPanel.module.css";

/**
 * What the surrounding task wants said, and what to do about it.
 *
 * `tone` exists because the Guest Desk previously rendered every one of these through
 * `.dialogStatus`, which is unconditionally `--danger` — so "12 rows are ready to check" and
 * a clarifying question both arrived in error red. A question is not a failure.
 */
export interface InviPanelStatus {
  /** Offered after a refusal: puts the message that failed back in the box. */
  retry?: (() => void) | undefined;
  text: string;
  tone: "danger" | "info";
}

interface InviTaskPanelProps {
  busy: boolean;
  /** Names the work rather than the wait — "Invi is reading your list". */
  busyLabel: string;
  className?: string | undefined;
  /** True while the surrounding form is saving. Invi is unavailable then, but not working. */
  disabled?: boolean | undefined;
  hint: string;
  inputId: string;
  label: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  sendLabel: string;
  status?: InviPanelStatus | null | undefined;
  /** Offered only while the exchange is empty, and they fill the box rather than sending. */
  suggestions?: readonly string[] | undefined;
  thread: readonly AssistantApiMessage[];
  value: string;
}

/**
 * Invi inside a task dialog: the exchange, the box, and one action.
 *
 * One component for both the Add guests composer and the invitation-message editor. They had
 * grown near-identical copies of this markup that were already drifting apart in their button
 * logic, and every improvement here would otherwise have to be written twice.
 *
 * It is deliberately not the floating panel. That thread is saved to history, streams its
 * answers, and carries three modes; this one belongs to the dialog it is inside, ends with it,
 * and does exactly one job. What it does borrow is the panel's vocabulary — the mascot and its
 * expressions, the thinking row, Enter to send, the day's allowance — so a creator who has met
 * Invi once recognizes it here.
 *
 * The parent owns the text. Refilling the box after a refusal is then an ordinary state
 * update rather than an instruction passed down into a child that owns it.
 */
export function InviTaskPanel({
  busy,
  busyLabel,
  className,
  disabled = false,
  hint,
  inputId,
  label,
  onChange,
  onSend,
  placeholder,
  sendLabel,
  status = null,
  suggestions,
  thread,
  value,
}: InviTaskPanelProps) {
  // Optional for the reason the Guest Desk's own is: these dialogs are the product and Invi is
  // an addition to them. Absent, the allowance line is simply not rendered.
  const assistant = useOptionalAssistant();
  const refreshUsage = assistant?.refreshUsage;

  /**
   * Reads the allowance when the dialog opens.
   *
   * The provider otherwise reads it when the floating panel is opened, so a creator who has
   * never opened the panel would spend a message here against a count that was never loaded —
   * and `AssistantUsageLine` renders nothing at all until it is. It never writes.
   */
  useEffect(() => {
    void refreshUsage?.();
  }, [refreshUsage]);

  const latest = thread.at(-1);
  const mascotState: InviState = busy
    ? "thinking"
    : status?.tone === "danger"
      ? "attention"
      : latest?.role === "assistant"
        ? "success"
        : thread.length > 0 || value.trim().length > 0
          ? "attentive"
          : "idle";

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends and Shift+Enter breaks the line, matching the floating panel. Reaching for
    // the button was the only way to send from here, which made a conversation feel like a form.
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!busy && !disabled && value.trim().length > 0) onSend();
  }

  return (
    <section className={className ? `${styles.panel} ${className}` : styles.panel}>
      <div className={styles.head}>
        <InviMascot className={styles.mascot} size="compact" state={mascotState} />
        <label htmlFor={inputId}>
          <span>{label}</span>
          <small>{hint}</small>
        </label>
      </div>

      {/*
        The exchange, not a transcript of the work.

        Invi's replies here are a sentence and any questions under it. The rows and the wording
        themselves belong to the fields below, so other people's names appear once on this
        screen rather than twice.
      */}
      {thread.length > 0 ? (
        <ol className={styles.thread}>
          {thread.map((entry, index) => (
            // Append-only within this dialog and never reordered, so the position is a stable
            // identity where the text is not.
            <li data-role={entry.role} key={index}>
              <span className={styles.role}>{entry.role === "user" ? "You" : "Invi"}</span>
              {entry.role === "assistant" ? (
                <AssistantAnswer text={entry.content} />
              ) : (
                <p>{entry.content}</p>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      {busy ? (
        <p className={styles.thinking}>
          {busyLabel}
          <span aria-hidden="true" className={styles.dots}>
            <i />
            <i />
            <i />
          </span>
        </p>
      ) : null}

      {/*
        Examples of what to say, offered only before anything has been said. They fill the box
        instead of sending it — the rule the floating panel settled on, because one tap used to
        spend a message from a twenty-message day on a request the creator had not finished
        reading.
      */}
      {thread.length === 0 && suggestions && suggestions.length > 0 ? (
        <ul className={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                disabled={busy || disabled}
                onClick={() => onChange(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <textarea
        disabled={busy || disabled}
        id={inputId}
        maxLength={MAX_MESSAGE_CHARACTERS}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        value={value}
      />

      <div className={styles.actions}>
        {assistant ? <AssistantUsageLine /> : <span />}
        {/* Short while it works: the row above already names what Invi is doing, and a
            sentence on a button wraps it to three lines on a phone. */}
        <button
          className={styles.send}
          disabled={busy || disabled || value.trim().length === 0}
          onClick={onSend}
          type="button"
        >
          {busy ? "Sending…" : sendLabel}
        </button>
      </div>

      {/*
        Beside the box it answers rather than at the foot of the dialog. On a phone the foot is
        below a fifty-row list, so the one sentence saying what just happened was off screen at
        the moment it mattered.
      */}
      {status ? (
        <p className={styles.status} data-tone={status.tone} role="status">
          {status.text}
          {status.retry ? (
            <button className={styles.retry} onClick={status.retry} type="button">
              Try again
            </button>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
