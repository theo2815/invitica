"use client";

import { type ClipboardEvent, type FormEvent, useEffect, useRef, useState } from "react";

import {
  MAX_MESSAGE_CHARACTERS,
  MAX_PARSED_GUEST_PARTIES,
  type ParsedGuestParty,
} from "../../contracts/assistant-api";
import { createGuestPartiesAction } from "../../server/guests/actions";
import type { GuestInvitationSummary } from "../../server/guests/guests";
import { requestGuestParties } from "../assistant/guest-parsing";
import { Close, Plus, Trash } from "../Icons";
import styles from "./GuestDesk.module.css";

interface GuestBulkComposerProps {
  /** Rows Tala parsed elsewhere, handed over for review. Nothing is created from them here. */
  initialParties?: readonly ParsedGuestParty[];
  invitation: GuestInvitationSummary;
  onClose: () => void;
  onCreated: (count: number) => void;
  /** False when `ASSISTANT_ENABLED` is off or no key is configured. Hides the Tala path only. */
  organizingAvailable?: boolean;
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

/**
 * A parsed party as an editable row.
 *
 * The greeting is left blank when it would merely repeat the name, because that is already
 * what the field's own placeholder and the submit fallback mean. Filling it in with a copy of
 * the name would look like a decision Tala made rather than the default it is.
 */
function rowFromParty(party: ParsedGuestParty, id: number): DraftRow {
  return {
    capacity: String(party.capacity),
    guestNames: party.guestNames.join(", "),
    id,
    internalLabel: party.internalLabel,
    recipientName: party.recipientName === party.internalLabel ? "" : party.recipientName,
  };
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
  initialParties,
  invitation,
  onClose,
  onCreated,
  organizingAvailable = false,
  returnFocusRef,
}: GuestBulkComposerProps) {
  const singleRecipient = invitation.occasion === "Romance";
  const staged = initialParties ?? [];
  const nextIdRef = useRef(staged.length + 2);
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const rowFieldRefs = useRef(new Map<number, HTMLInputElement>());
  const [rows, setRows] = useState<DraftRow[]>(() =>
    staged.length > 0
      ? staged.map((party, index) => rowFromParty(party, index + 1))
      : [emptyRow(1)],
  );
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    staged.length > 0
      ? `${staged.length} ${staged.length === 1 ? "row is" : "rows are"} ready to check. Nothing is created until you choose to.`
      : null,
  );
  const [invalidRows, setInvalidRows] = useState<Set<number>>(new Set());
  const [pastedList, setPastedList] = useState("");
  const [isOrganizing, setIsOrganizing] = useState(false);
  const mutationIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    firstFieldRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      // Closing mid-parse would discard an answer that has already been billed, so the
      // dialog holds until it lands — the same rule the submit already follows.
      if (event.key === "Escape" && !isPending && !isOrganizing) {
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
  }, [isOrganizing, isPending, onClose, returnFocusRef]);

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

  /**
   * Sends the pasted list to Tala and appends whatever comes back as ordinary rows.
   *
   * Appended rather than substituted, and blank rows dropped first, so a creator who has
   * already typed three parties by hand keeps them — and so a list too long for one paste can
   * be done in two. Every row lands in the same fields as a typed one and is corrected the
   * same way, which is why this screen needs no second review table.
   *
   * One turn spends one message from the daily allowance, the same as a question. That is why
   * the plain tab-separated paste below stays: a creator with a tidy spreadsheet should not
   * pay a model to read it.
   */
  async function organize() {
    const text = pastedList.trim();
    if (!text || isOrganizing || isPending) return;

    setIsOrganizing(true);
    setMessage(null);

    const result = await requestGuestParties(invitation.invitationId, [
      { content: text, role: "user" },
    ]);

    if (result.status === "refused") {
      setMessage(result.message);
      setIsOrganizing(false);
      return;
    }

    let added = 0;
    setRows((current) => {
      const kept = current.filter((row) => row.internalLabel.trim().length > 0);
      const room = MAX_PARSED_GUEST_PARTIES - kept.length;
      const additions = result.parties.slice(0, Math.max(room, 0)).map((party) => {
        const row = rowFromParty(party, nextIdRef.current);
        nextIdRef.current += 1;
        return row;
      });
      added = additions.length;
      const next = [...kept, ...additions];
      return next.length > 0 ? next : [emptyRow(nextIdRef.current++)];
    });

    setPastedList("");
    setMessage(
      added < result.parties.length
        ? `${added} of ${result.parties.length} rows were added. This screen holds ${MAX_PARSED_GUEST_PARTIES}, so create these first and then paste the rest.`
        : `${added} ${added === 1 ? "row is" : "rows are"} ready to check. Nothing is created until you choose to.`,
    );
    setIsOrganizing(false);
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
              disabled={isPending || isOrganizing}
              onClick={onClose}
              type="button"
            >
              <Close />
            </button>
          </div>
        </header>

        <form
          aria-busy={isPending || isOrganizing || undefined}
          onSubmit={(event) => void submit(event)}
        >
          {organizingAvailable ? (
            <section className={styles.organizer}>
              <label htmlFor="guest-list-paste">
                <span>Paste a messy list and let Tala sort it</span>
                <small>
                  Names, nicknames, and counts like &ldquo;+2&rdquo; in whatever order they are
                  already in. Their names are sent to Invitica&rsquo;s AI provider to be read, and
                  you check every row below before anything is created.
                </small>
              </label>
              <textarea
                disabled={isPending || isOrganizing}
                id="guest-list-paste"
                maxLength={MAX_MESSAGE_CHARACTERS}
                onChange={(event) => setPastedList(event.target.value)}
                placeholder={
                  singleRecipient
                    ? "Mia Santos, Ana Cruz, Tita Baby"
                    : "Tita Baby +2, Kuya Jun & Ate Mae, Santos family (5)"
                }
                rows={3}
                value={pastedList}
              />
              <button
                className={styles.organizeAction}
                disabled={isPending || isOrganizing || pastedList.trim().length === 0}
                onClick={() => void organize()}
                type="button"
              >
                {isOrganizing ? "Organizing…" : "Organize with Tala"}
              </button>
            </section>
          ) : null}

          <div className={styles.bulkRows}>
            {rows.map((row, index) => (
              <fieldset
                className={styles.bulkRow}
                data-invalid={invalidRows.has(row.id)}
                disabled={isPending || isOrganizing}
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
              disabled={isPending || isOrganizing || rows.length >= 50}
              onClick={() => addRows(1)}
              type="button"
            >
              <Plus /> Add row
            </button>
            <button
              disabled={isPending || isOrganizing || rows.length >= 50}
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
            <button disabled={isPending || isOrganizing} onClick={onClose} type="button">
              Cancel
            </button>
            <button disabled={isPending || isOrganizing} type="submit">
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
