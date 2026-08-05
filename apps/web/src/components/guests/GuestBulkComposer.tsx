"use client";

import { type ClipboardEvent, type FormEvent, useEffect, useRef, useState } from "react";

import { createGuestPartiesAction } from "../../server/guests/actions";
import type { GuestInvitationSummary } from "../../server/guests/guests";
import { Close, Plus, Trash } from "../Icons";
import styles from "./GuestDesk.module.css";

interface GuestBulkComposerProps {
  invitation: GuestInvitationSummary;
  onClose: () => void;
  onCreated: (count: number) => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}

interface DraftRow {
  capacity: string;
  guestNames: string;
  id: number;
  internalLabel: string;
  recipientName: string;
}

function emptyRow(id: number): DraftRow {
  return { capacity: "1", guestNames: "", id, internalLabel: "", recipientName: "" };
}

function splitGuestNames(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function pastedRows(value: string, startId: number, singleRecipient: boolean): DraftRow[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [internalLabel = "", recipientName = "", capacity = "1"] = line
        .split("\t")
        .map((cell) => cell.trim());
      return {
        capacity: singleRecipient ? "1" : /^\d+$/.test(capacity) ? capacity : "1",
        guestNames: "",
        id: startId + index,
        internalLabel,
        recipientName,
      };
    });
}

export function GuestBulkComposer({
  invitation,
  onClose,
  onCreated,
  returnFocusRef,
}: GuestBulkComposerProps) {
  const singleRecipient = invitation.occasion === "Romance";
  const nextIdRef = useRef(2);
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const rowFieldRefs = useRef(new Map<number, HTMLInputElement>());
  const [rows, setRows] = useState<DraftRow[]>([emptyRow(1)]);
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [invalidRows, setInvalidRows] = useState<Set<number>>(new Set());
  const mutationIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    firstFieldRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        event.preventDefault();
        onClose();
        returnFocusRef.current?.focus();
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
  }, [isPending, onClose, returnFocusRef]);

  function updateRow(id: number, updates: Partial<DraftRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...updates } : row)));
    setInvalidRows((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function addRows(count: number) {
    setRows((current) => {
      const available = Math.min(count, 50 - current.length);
      const additions = Array.from({ length: available }, () => {
        const row = emptyRow(nextIdRef.current);
        nextIdRef.current += 1;
        return row;
      });
      const firstAddition = additions[0];
      if (firstAddition) {
        window.requestAnimationFrame(() => rowFieldRefs.current.get(firstAddition.id)?.focus());
      }
      return [...current, ...additions];
    });
  }

  function removeRow(id: number) {
    setRows((current) => {
      if (current.length === 1) return [emptyRow(nextIdRef.current++)];
      const index = current.findIndex((row) => row.id === id);
      const next = current.filter((row) => row.id !== id);
      const focusTarget = next[Math.min(index, next.length - 1)];
      window.requestAnimationFrame(() =>
        focusTarget ? rowFieldRefs.current.get(focusTarget.id)?.focus() : undefined,
      );
      return next;
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, rowId: number) {
    const value = event.clipboardData.getData("text");
    const additions = pastedRows(value, nextIdRef.current, singleRecipient);
    if (additions.length <= 1) return;
    event.preventDefault();
    const available = additions.slice(0, 50 - rows.length + 1);
    nextIdRef.current += available.length;
    setRows((current) => {
      const index = current.findIndex((row) => row.id === rowId);
      return [...current.slice(0, index), ...available, ...current.slice(index + 1)].slice(0, 50);
    });
    setMessage(`${available.length} rows prepared from your pasted list.`);
  }

  function continueFromName(event: React.KeyboardEvent<HTMLInputElement>, rowId: number) {
    if (event.key !== "Enter" || isPending) return;
    event.preventDefault();
    const index = rows.findIndex((row) => row.id === rowId);
    const nextRow = rows[index + 1];
    if (nextRow) {
      rowFieldRefs.current.get(nextRow.id)?.focus();
      return;
    }
    if (rows.length < 50) addRows(1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = rows.map((row) => ({
      capacity: singleRecipient ? 1 : Number(row.capacity),
      guestNames: splitGuestNames(row.guestNames),
      internalLabel: row.internalLabel.trim(),
      recipientName: row.recipientName.trim() || row.internalLabel.trim(),
    }));
    const invalid = new Set<number>();
    normalized.forEach((party, index) => {
      if (
        !party.internalLabel ||
        party.internalLabel.length > 120 ||
        !party.recipientName ||
        party.recipientName.length > 120 ||
        !Number.isInteger(party.capacity) ||
        party.capacity < 1 ||
        party.capacity > 50 ||
        (singleRecipient && party.capacity !== 1) ||
        party.guestNames.length > party.capacity ||
        party.guestNames.some((name) => name.length > 120)
      ) {
        const row = rows[index];
        if (row) invalid.add(row.id);
      }
    });
    setInvalidRows(invalid);
    if (invalid.size > 0) {
      setMessage(
        "Check the highlighted rows. Names and greetings are required, and members cannot exceed seats.",
      );
      const firstInvalidId = [...invalid][0];
      if (firstInvalidId !== undefined) {
        window.requestAnimationFrame(() => rowFieldRefs.current.get(firstInvalidId)?.focus());
      }
      return;
    }

    setIsPending(true);
    setMessage(null);
    let createdCount: number | null = null;
    try {
      const result = await createGuestPartiesAction({
        invitationId: invitation.invitationId,
        mutationId: mutationIdRef.current,
        parties: normalized,
      });
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      createdCount = result.count;
    } catch {
      setMessage(
        "Invitica could not create these guest parties. Check your connection and try again.",
      );
    } finally {
      setIsPending(false);
    }
    if (createdCount !== null) onCreated(createdCount);
  }

  return (
    <div className={styles.backdrop}>
      <section
        aria-describedby="bulk-guests-description"
        aria-labelledby="bulk-guests-title"
        aria-modal="true"
        className={`${styles.dialog} ${styles.bulkDialog}`}
        ref={dialogRef}
        role="dialog"
      >
        <header className={styles.bulkHeader}>
          <div>
            <p className={styles.eyebrow}>{singleRecipient ? "Add recipients" : "Add guests"}</p>
            <h2 id="bulk-guests-title">
              {singleRecipient ? "Prepare personal invitations" : "Prepare one or many invitations"}
            </h2>
            <p id="bulk-guests-description">
              {singleRecipient
                ? "Each row creates one private invitation for one recipient. Paste a one-column list into any name field, or paste tab-separated names and greetings from a spreadsheet."
                : "Each row is one RSVP party. Paste a one-column list into any name field, or paste tab-separated name, greeting, and seats from a spreadsheet. Press Enter after a party name to continue to the next row."}
            </p>
          </div>
          <div className={styles.modalHeaderActions}>
            <strong>{rows.length} / 50</strong>
            <button
              aria-label={singleRecipient ? "Close add recipients" : "Close add guests"}
              className={styles.modalClose}
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              <Close />
            </button>
          </div>
        </header>

        <form aria-busy={isPending || undefined} onSubmit={(event) => void submit(event)}>
          <div className={styles.bulkRows}>
            {rows.map((row, index) => (
              <fieldset
                className={styles.bulkRow}
                data-invalid={invalidRows.has(row.id)}
                disabled={isPending}
                key={row.id}
              >
                <legend>
                  {singleRecipient ? "Personal invitation" : "Guest party"} {index + 1}
                </legend>
                <label>
                  <span>{singleRecipient ? "Recipient name" : "Guest or party name"}</span>
                  <input
                    aria-invalid={invalidRows.has(row.id)}
                    maxLength={120}
                    onChange={(event) => updateRow(row.id, { internalLabel: event.target.value })}
                    onKeyDown={(event) => continueFromName(event, row.id)}
                    onPaste={(event) => handlePaste(event, row.id)}
                    placeholder={singleRecipient ? "Mia Santos" : "John Cruz or Santos family"}
                    ref={(element) => {
                      if (element) {
                        rowFieldRefs.current.set(row.id, element);
                        if (index === 0) firstFieldRef.current = element;
                      } else rowFieldRefs.current.delete(row.id);
                    }}
                    value={row.internalLabel}
                  />
                </label>
                <label>
                  <span>Envelope greeting</span>
                  <input
                    maxLength={120}
                    onChange={(event) => updateRow(row.id, { recipientName: event.target.value })}
                    placeholder="Same as name"
                    value={row.recipientName}
                  />
                </label>
                {singleRecipient ? (
                  <p className={styles.singleRecipientNote}>One recipient</p>
                ) : (
                  <>
                    <label className={styles.capacityField}>
                      <span>Seats</span>
                      <input
                        inputMode="numeric"
                        max={50}
                        min={1}
                        onChange={(event) => updateRow(row.id, { capacity: event.target.value })}
                        type="number"
                        value={row.capacity}
                      />
                    </label>
                    <label className={styles.memberField}>
                      <span>
                        Members <small>Optional, comma or new line</small>
                      </span>
                      <textarea
                        maxLength={6049}
                        onChange={(event) => updateRow(row.id, { guestNames: event.target.value })}
                        placeholder={row.capacity === "1" ? "Uses the guest name" : "Lena, Paolo"}
                        rows={1}
                        value={row.guestNames}
                      />
                    </label>
                  </>
                )}
                <button
                  aria-label={`Remove ${singleRecipient ? "personal invitation" : "guest party"} ${index + 1}`}
                  className={styles.removeDraftRow}
                  onClick={() => removeRow(row.id)}
                  type="button"
                >
                  <Trash />
                </button>
              </fieldset>
            ))}
          </div>

          <div className={styles.bulkTools}>
            <button
              disabled={isPending || rows.length >= 50}
              onClick={() => addRows(1)}
              type="button"
            >
              <Plus /> Add row
            </button>
            <button
              disabled={isPending || rows.length >= 50}
              onClick={() => addRows(5)}
              type="button"
            >
              Add 5 rows
            </button>
          </div>

          <p aria-live="polite" className={styles.dialogStatus} role="status">
            {message}
          </p>
          <div className={styles.dialogActions}>
            <button disabled={isPending} onClick={onClose} type="button">
              Cancel
            </button>
            <button disabled={isPending} type="submit">
              {isPending
                ? "Preparing invitations..."
                : singleRecipient
                  ? `Create ${rows.length} ${rows.length === 1 ? "invitation" : "invitations"}`
                  : `Create ${rows.length} ${rows.length === 1 ? "party" : "parties"}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
