"use client";

import { useState, useTransition } from "react";

import { deleteAssistantConversations } from "../../server/account/actions";
import type { AssistantUsage } from "../../server/assistant/usage";
import { ConfirmDialog } from "../feedback/ConfirmDialog";
import { Trash } from "../Icons";
import styles from "./Settings.module.css";
import { SettingsStatus } from "./SettingsSection";

interface AssistantDataPanelProps {
  savedConversations: number;
  usage: AssistantUsage | null;
}

/**
 * What Invi has stored about this creator, and the control that removes it.
 *
 * Saved conversations are the first place Invitica keeps a creator's own words — and, in
 * guest-list mode, their guests' real names — at rest (migration `0033`, and the founder decision
 * behind it). The Invi page already deletes one thread at a time; this is the whole record, which
 * is what a data-deletion request actually asks for.
 *
 * `usage` is null whenever `assistant_message_usage()` cannot be read, which is its state until
 * migration `0034` is applied hosted. The meter says so rather than showing a zero that would
 * read as an untouched allowance.
 */
export function AssistantDataPanel({ savedConversations, usage }: AssistantDataPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<null | { message: string; tone: "danger" | "success" }>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteAssistantConversations();
      setConfirming(false);
      setStatus(
        result.error
          ? { message: result.error, tone: "danger" }
          : {
              message: result.notice ?? "Every saved conversation has been deleted.",
              tone: "success",
            },
      );
    });
  }

  const spent = usage ? Math.min(usage.used, usage.dailyLimit) : 0;
  const share = usage && usage.dailyLimit > 0 ? (spent / usage.dailyLimit) * 100 : 0;

  return (
    <>
      {status ? <SettingsStatus message={status.message} tone={status.tone} /> : null}

      <div className={styles.meter}>
        {usage ? (
          <>
            {/* The bar is decoration over a sentence that already carries the number, so it is
                hidden rather than given a role a screen reader would read twice. */}
            <div aria-hidden="true" className={styles.meterTrack}>
              <div className={styles.meterFill} style={{ width: `${share}%` }} />
            </div>
            <p className={styles.meterLabel}>
              {spent} of {usage.dailyLimit} messages used today.
            </p>
          </>
        ) : (
          <p className={styles.meterLabel}>Today&rsquo;s message count is unavailable right now.</p>
        )}
      </div>

      <p className={styles.inlineNote}>
        {savedConversations === 0
          ? "You have no saved conversations with Invi."
          : `You have ${savedConversations} saved ${savedConversations === 1 ? "conversation" : "conversations"} with Invi. Deleting them is permanent.`}
      </p>

      {savedConversations > 0 ? (
        <div className={styles.panelActions}>
          <button
            className={styles.dangerButton}
            disabled={pending}
            onClick={() => setConfirming(true)}
            type="button"
          >
            <Trash />
            <span>Delete all conversations</span>
          </button>
        </div>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          cancelLabel="Keep them"
          confirmLabel="Delete all"
          description={`This permanently deletes all ${savedConversations} saved conversations, including any guest names in them. Your invitations, guests, and replies are not affected.`}
          eyebrow="Invi data"
          onCancel={() => setConfirming(false)}
          onConfirm={confirmDelete}
          pending={pending}
          pendingLabel="Deleting…"
          title="Delete every saved conversation?"
        />
      ) : null}
    </>
  );
}
