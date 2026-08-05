"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";

import { MAX_MESSAGE_CHARACTERS } from "../../contracts/assistant-api";
import styles from "./Assistant.module.css";
import { useAssistant } from "./AssistantProvider";

const SUGGESTIONS = [
  "How do I send personalized links?",
  "Why can't my guest see the reply form?",
  "What happens when I publish an update?",
];

/**
 * The thread and its composer. One component, rendered by both the floating widget and
 * `/dashboard/assistant`, so the two cannot drift into two different chat surfaces.
 */
export function AssistantConversation({ autoFocus = false }: { autoFocus?: boolean }) {
  const { clear, messages, notice, send, status } = useAssistant();
  const [draft, setDraft] = useState("");
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

  const remaining = MAX_MESSAGE_CHARACTERS - draft.length;

  return (
    <div className={styles.conversation}>
      <div className={styles.log}>
        {messages.length === 0 && !notice ? (
          <div className={styles.empty}>
            <p className={styles.emptyLead}>
              Ask how anything in Invitica works. The assistant answers from Invitica's own help
              material, and it never changes your invitations.
            </p>
            <ul className={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
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
              <span className={styles.messageRole}>
                {message.role === "user" ? "You" : "Assistant"}
              </span>
              <p className={styles.messageBody}>{message.content}</p>
            </li>
          ))}
        </ol>

        {notice ? (
          <p className={styles.notice} role="alert">
            {notice}
          </p>
        ) : null}

        {/* The answer itself is not announced token by token — that would read every
            fragment aloud. One polite status per turn is the useful amount. */}
        <p aria-live="polite" className={styles.visuallyHidden}>
          {isAnswering ? "The assistant is answering." : ""}
        </p>

        <div ref={logEndRef} />
      </div>

      <form className={styles.composer} onSubmit={submit}>
        <label className={styles.visuallyHidden} htmlFor="assistant-composer">
          Ask the Invitica assistant
        </label>
        <textarea
          className={styles.input}
          disabled={isAnswering}
          id="assistant-composer"
          maxLength={MAX_MESSAGE_CHARACTERS}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="Ask how something works…"
          ref={composerRef}
          rows={2}
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
            {isAnswering ? "Answering…" : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}
