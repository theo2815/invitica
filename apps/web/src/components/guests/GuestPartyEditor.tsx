"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { updateGuestPartyAction } from "../../server/guests/actions";
import type { GuestPartySummary } from "../../server/guests/guests";
import { Close } from "../Icons";
import styles from "./GuestDesk.module.css";

interface GuestPartyEditorProps {
  invitationId: string;
  onClose: () => void;
  onUpdated: () => void;
  party: GuestPartySummary;
  singleRecipient: boolean;
}

function splitGuestNames(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function GuestPartyEditor({
  invitationId,
  onClose,
  onUpdated,
  party,
  singleRecipient,
}: GuestPartyEditorProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [capacity, setCapacity] = useState(String(party.capacity));
  const [guestNames, setGuestNames] = useState(
    party.guestMembers.map((member) => member.name).join("\n"),
  );
  const [internalLabel, setInternalLabel] = useState(party.internalLabel);
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState(party.recipientName);
  const minimumCapacity = Math.max(
    1,
    party.response?.attendance === "attending" ? party.response.attendeeCount : 0,
  );

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
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled])",
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCapacity = singleRecipient ? 1 : Number(capacity);
    const normalizedLabel = internalLabel.trim();
    const normalizedRecipient = recipientName.trim();
    const normalizedGuestNames = singleRecipient ? [normalizedLabel] : splitGuestNames(guestNames);

    if (!normalizedLabel || !normalizedRecipient) {
      setMessage(
        singleRecipient
          ? "Recipient name and envelope greeting are required."
          : "Party name and envelope greeting are required.",
      );
      return;
    }
    if (
      !Number.isInteger(normalizedCapacity) ||
      normalizedCapacity < minimumCapacity ||
      normalizedCapacity > 50
    ) {
      setMessage(
        minimumCapacity > 1
          ? `Seats must be between ${minimumCapacity} and 50 because this party already has ${minimumCapacity} attending.`
          : "Seats must be between 1 and 50.",
      );
      return;
    }
    if (
      normalizedGuestNames.length > normalizedCapacity ||
      normalizedGuestNames.some((name) => name.length > 120)
    ) {
      setMessage(
        "Named members cannot exceed seats, and each name must be 120 characters or less.",
      );
      return;
    }

    setIsPending(true);
    setMessage(null);
    let updated = false;
    try {
      const result = await updateGuestPartyAction({
        capacity: normalizedCapacity,
        expectedRevision: party.revision,
        guestNames: normalizedGuestNames,
        guestPartyId: party.id,
        internalLabel: normalizedLabel,
        invitationId,
        recipientName: normalizedRecipient,
      });
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      updated = true;
    } catch {
      setMessage("Invitica could not save this guest party. Check your connection and try again.");
    } finally {
      setIsPending(false);
    }
    if (updated) onUpdated();
  }

  return (
    <div className={styles.backdrop}>
      <section
        aria-describedby="edit-party-description"
        aria-labelledby="edit-party-title"
        aria-modal="true"
        className={`${styles.dialog} ${styles.editDialog}`}
        ref={dialogRef}
        role="dialog"
      >
        <header className={styles.dialogHeader}>
          <div>
            <p className={styles.eyebrow}>
              {singleRecipient ? "Edit personal invitation" : "Edit guest party"}
            </p>
            <h2 id="edit-party-title">Update {party.internalLabel}</h2>
            <p id="edit-party-description">
              Changes keep the current private link and response history.
            </p>
          </div>
          <button
            aria-label={
              singleRecipient ? "Close personal invitation editor" : "Close edit guest party"
            }
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
          <label>
            <span>{singleRecipient ? "Recipient name" : "Guest or party name"}</span>
            <input
              disabled={isPending}
              maxLength={120}
              onChange={(event) => setInternalLabel(event.currentTarget.value)}
              ref={firstFieldRef}
              value={internalLabel}
            />
          </label>
          <label>
            <span>Envelope greeting</span>
            <input
              disabled={isPending}
              maxLength={120}
              onChange={(event) => setRecipientName(event.currentTarget.value)}
              value={recipientName}
            />
          </label>
          {singleRecipient ? (
            <p className={styles.singleRecipientEditorNote}>
              <strong>One recipient</strong>
              <span>This personal invitation always belongs to one person.</span>
            </p>
          ) : (
            <>
              <label>
                <span>Seats</span>
                <input
                  disabled={isPending}
                  inputMode="numeric"
                  max={50}
                  min={minimumCapacity}
                  onChange={(event) => setCapacity(event.currentTarget.value)}
                  type="number"
                  value={capacity}
                />
                {minimumCapacity > 1 ? (
                  <small>
                    At least {minimumCapacity} seats because this party has already responded.
                  </small>
                ) : null}
              </label>
              <label>
                <span>Named members</span>
                <textarea
                  disabled={isPending}
                  maxLength={6049}
                  onChange={(event) => setGuestNames(event.currentTarget.value)}
                  placeholder="One name per line, or separate names with commas"
                  rows={5}
                  value={guestNames}
                />
              </label>
            </>
          )}

          <p aria-live="polite" className={styles.dialogStatus} role="status">
            {message}
          </p>
          <div className={styles.dialogActions}>
            <button disabled={isPending} onClick={onClose} type="button">
              Cancel
            </button>
            <button disabled={isPending} type="submit">
              {isPending ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
