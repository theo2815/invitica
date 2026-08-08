"use client";

import { useState, useTransition } from "react";

import { requestAccountDeletion } from "../../server/account/actions";
import { ConfirmDialog } from "../feedback/ConfirmDialog";
import { Trash } from "../Icons";
import styles from "./Settings.module.css";
import { SettingsStatus } from "./SettingsSection";

interface DeleteAccountPanelProps {
  invitationCount: number;
  publishedCount: number;
}

/**
 * Step one of the two-step deletion: the warning, the confirmation, and the email that follows.
 *
 * The warning is specific rather than generic. "This cannot be undone" is true of a great many
 * things; **"the 3 invitations you have published stop opening for your guests"** is the
 * consequence a creator is actually deciding about, and it is the one they cannot discover
 * afterwards.
 */
export function DeleteAccountPanel({ invitationCount, publishedCount }: DeleteAccountPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<null | { message: string; tone: "danger" | "success" }>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function requestDeletion() {
    startTransition(async () => {
      const result = await requestAccountDeletion();
      setConfirming(false);
      setStatus(
        result.error
          ? { message: result.error, tone: "danger" }
          : { message: result.notice ?? "Check your email to finish.", tone: "success" },
      );
    });
  }

  return (
    <>
      {status ? <SettingsStatus message={status.message} tone={status.tone} /> : null}

      <p className={styles.inlineNote}>
        Deleting your account permanently removes {countPhrase(invitationCount, "invitation")}, your
        guest lists, and every reply your guests have sent.
        {publishedCount > 0
          ? ` The ${publishedCount === 1 ? "invitation you have published stops" : `${publishedCount} invitations you have published stop`} opening for your guests.`
          : ""}{" "}
        It cannot be undone.
      </p>

      <p className={styles.inlineNote}>
        You will be asked to confirm, then to follow a link we send to your email address. Nothing
        is deleted until you follow that link.
      </p>

      <div className={styles.panelActions}>
        <button
          className={styles.dangerButton}
          disabled={pending}
          onClick={() => setConfirming(true)}
          type="button"
        >
          <Trash />
          <span>Delete my account</span>
        </button>
      </div>

      {confirming ? (
        <ConfirmDialog
          cancelLabel="Keep my account"
          confirmLabel="Yes, email me the link"
          description={`This is permanent. ${countPhrase(invitationCount, "invitation", true)}, your guest lists, and every reply your guests have sent are deleted, and any invitation link you have shared stops working. We will email you a link to confirm — nothing is deleted until you follow it.`}
          eyebrow="Delete account"
          onCancel={() => setConfirming(false)}
          onConfirm={requestDeletion}
          pending={pending}
          pendingLabel="Sending the link…"
          title="Delete your Invitica account?"
        />
      ) : null}
    </>
  );
}

function countPhrase(count: number, noun: string, capitalize = false): string {
  const phrase =
    count === 0
      ? `your account`
      : `${count === 1 ? `your ${noun}` : `all ${count} of your ${noun}s`}`;
  return capitalize ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase;
}
