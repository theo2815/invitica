"use client";

import { useState } from "react";

import styles from "./Assistant.module.css";
import { useAssistant } from "./AssistantProvider";

/**
 * The saved threads, listed newest first.
 *
 * It replaces the log rather than floating over it. A drawer on top of a 24 rem panel, or
 * on top of a full-height mobile sheet, would be a second modal layer inside a surface
 * that is already one — and the creator is choosing which conversation to read, not doing
 * something beside the one they have open.
 *
 * Titles are the creator's own first message, so the list is a list of things they asked.
 * Nothing here is generated, which also means nothing here can be reworded without them.
 */

/** Days here are the reader's own, so "today" means the day they are looking at it. */
function describeWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.valueOf())) return "";

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((startOfToday.valueOf() - at.valueOf()) / 86_400_000);

  if (days < 0) return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (days < 1) return "Yesterday";
  return at.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function AssistantHistory({ onOpened }: { onOpened: () => void }) {
  const { conversationId, conversations, deleteConversation, historyStatus, openConversation } =
    useAssistant();
  // Deleting a conversation cannot be undone, so it asks once. An inline second press
  // rather than a dialog: a creator tidying a list should not have the panel taken over
  // between one row and the next.
  const [confirming, setConfirming] = useState<null | string>(null);

  if (conversations.length === 0) {
    return (
      <div className={styles.historyEmpty}>
        <p>
          {historyStatus === "loading"
            ? "Opening your conversations…"
            : "Your conversations with Tala are saved here once you have sent a message. Only you can read them, and you can delete any of them."}
        </p>
      </div>
    );
  }

  return (
    <>
      {/*
        Opening a saved thread used to say nothing at all. The rows went disabled and the
        panel sat there until the messages arrived — on a slow connection, which is the
        normal one here, that reads as a list that has stopped working. The empty list had
        a loading sentence; a populated one, which is every list a creator actually has,
        had none.
      */}
      {historyStatus === "loading" ? (
        <p className={styles.historyLoading} role="status">
          Opening that conversation…
        </p>
      ) : null}

      <ul className={styles.historyList}>
        {conversations.map((conversation) => (
          <li className={styles.historyItem} key={conversation.id}>
            <button
              aria-current={conversation.id === conversationId ? "true" : undefined}
              className={styles.historyOpen}
              disabled={historyStatus === "loading"}
              onClick={() => {
                void openConversation(conversation.id);
                onOpened();
              }}
              type="button"
            >
              <span className={styles.historyTitle}>{conversation.title}</span>
              <span className={styles.historyWhen}>{describeWhen(conversation.updatedAt)}</span>
            </button>

            {confirming === conversation.id ? (
              <span className={styles.historyConfirm}>
                <button
                  className={styles.historyDeleteConfirm}
                  onClick={() => {
                    setConfirming(null);
                    void deleteConversation(conversation.id);
                  }}
                  type="button"
                >
                  Delete
                </button>
                <button
                  className={styles.historyDeleteCancel}
                  onClick={() => setConfirming(null)}
                  type="button"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                className={styles.historyDelete}
                onClick={() => setConfirming(conversation.id)}
                type="button"
              >
                <span className={styles.visuallyHidden}>Delete “{conversation.title}”</span>
                <span aria-hidden="true">×</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
