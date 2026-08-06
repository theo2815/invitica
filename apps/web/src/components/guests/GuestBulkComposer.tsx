"use client";

import {
  type ClipboardEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type AssistantApiMessage,
  guestConversationPayload,
  guestListMessage,
  guestQuestionsMessage,
  MAX_PARSED_GUEST_PARTIES,
  type ParsedGuestParty,
} from "../../contracts/assistant-api";
import { createGuestPartiesAction } from "../../server/guests/actions";
import type { GuestInvitationSummary } from "../../server/guests/guests";
import { requestGuestParties } from "../assistant/guest-parsing";
import { type TalaPanelStatus, TalaTaskPanel } from "../assistant/TalaTaskPanel";
import { DiscardChangesDialog } from "../feedback/DiscardChangesDialog";
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

/**
 * Deliberately messy, and deliberately invented.
 *
 * They are examples of a list as it actually exists in a group chat, because a tidy example
 * would teach a creator to tidy their list first — which is the work this removes. No name here
 * belongs to anyone: fixtures never carry real guest data.
 */
const GUEST_SUGGESTIONS = [
  "Tita Baby +2, Kuya Jun & Ate Mae, Santos family (5), Ninong Ramon",
  "Lola Remedios and her two nurses on one invitation",
];

const RECIPIENT_SUGGESTIONS = [
  "Mia Santos, Ana Cruz, Tita Baby, Ninong Ramon",
  "Everyone from the Cruz side: Ate Bea, Kuya Nico, Lola Remedios",
];

/** How long a row that Tala just changed stays marked. Long enough to find, short enough to go. */
const ARRIVED_MARK_MS = 2600;

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

/**
 * An untouched row is the composer's own placeholder, not a guest.
 *
 * The Create button used to count every row, so an empty composer offered **Create 1 party**
 * and then refused it on validation. Rows that are blank in every field are left out of both
 * the count and the submission; a row with anything in it at all is still validated, so a
 * greeting typed without a name is reported rather than silently dropped.
 */
function isBlankRow(row: DraftRow): boolean {
  return (
    row.internalLabel.trim().length === 0 &&
    row.recipientName.trim().length === 0 &&
    row.guestNames.trim().length === 0 &&
    row.capacity === "1"
  );
}

/**
 * The rows as they stand right now, in the shape the conversation carries them.
 *
 * This is what makes a follow-up here better than one in the floating panel: the panel can
 * only send back what Tala last produced, while this sends what the creator is actually
 * looking at — including every seat they corrected and every greeting they retyped. A
 * request to change the third row therefore reaches the third row on screen.
 *
 * Blank rows are left out. An empty row is the composer's own placeholder, not a guest.
 */
function partiesFromRows(rows: readonly DraftRow[], singleRecipient: boolean): ParsedGuestParty[] {
  return rows
    .filter((row) => row.internalLabel.trim().length > 0)
    .map((row) => {
      const internalLabel = row.internalLabel.trim();
      const capacity = Number(row.capacity);

      return {
        capacity: singleRecipient || !Number.isInteger(capacity) || capacity < 1 ? 1 : capacity,
        guestNames: singleRecipient ? [] : splitGuestNames(row.guestNames),
        internalLabel,
        recipientName: row.recipientName.trim() || internalLabel,
      };
    });
}

/**
 * Everything about one party that a creator would notice changing.
 *
 * Used to tell which rows an answer actually altered, so a correction marks the row it
 * corrected instead of the whole list. Position is deliberately absent: a row that only moved
 * has not changed.
 */
function partyKey(party: ParsedGuestParty): string {
  return [
    party.internalLabel,
    party.recipientName,
    String(party.capacity),
    party.guestNames.join(", "),
  ].join(" | ");
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
  /** The form's own line, beside Create. Only the paste count here is not a failure. */
  const [message, setMessage] = useState<{ text: string; tone: "danger" | "info" } | null>(null);
  const [invalidRows, setInvalidRows] = useState<Set<number>>(new Set());
  const [pastedList, setPastedList] = useState("");
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  /** Rows an answer added or altered, marked briefly so the change is findable. */
  const [arrivedRows, setArrivedRows] = useState<Set<number>>(new Set());
  /**
   * What Tala has to say about the last turn, beside the box it was typed into.
   *
   * Separate from `message`, which belongs to the form and its Create button. They used to
   * share one line at the foot of the dialog — below a fifty-row list on a phone — and that
   * line is styled `--danger`, so a successful count and a clarifying question both arrived
   * looking like errors.
   */
  const [talaStatus, setTalaStatus] = useState<TalaPanelStatus | null>(
    staged.length > 0
      ? {
          text: `${staged.length} ${staged.length === 1 ? "row is" : "rows are"} ready to check. Nothing is created until you choose to.`,
          tone: "info",
        }
      : null,
  );
  /**
   * The exchange with Tala inside this dialog.
   *
   * It used to be one message with no memory: every press of Organize sent a single paste and
   * nothing else, so "the Santos family is six" was read as a brand new list containing one
   * family. The thread is what turns the box below into a conversation, and it is deliberately
   * local — it is not the floating panel's thread and it is not saved to history.
   */
  const [thread, setThread] = useState<AssistantApiMessage[]>([]);
  const mutationIdRef = useRef(crypto.randomUUID());

  const readyRows = rows.filter((row) => !isBlankRow(row));
  /**
   * Whether closing now would throw away work.
   *
   * Rows handed over from the floating panel make this true from the moment the dialog opens,
   * which is the case worth protecting most: nothing there was typed, so a stray Escape used
   * to discard a whole parsed guest list that had already been paid for.
   */
  const dirty = readyRows.length > 0 || thread.length > 0 || pastedList.trim().length > 0;

  const requestClose = useCallback(() => {
    if (isPending || isOrganizing) return;
    if (dirty) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  }, [dirty, isOrganizing, isPending, onClose]);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    if (arrivedRows.size === 0) return;
    const timer = window.setTimeout(() => setArrivedRows(new Set()), ARRIVED_MARK_MS);
    return () => window.clearTimeout(timer);
  }, [arrivedRows]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // The discard question owns the keyboard while it is open, including this trap. Without
      // that, Tab from inside it walks back into the very form it is protecting.
      if (confirmingClose) return;
      // Closing mid-parse would discard an answer that has already been billed, so the
      // dialog holds until it lands — the same rule the submit already follows.
      if (event.key === "Escape" && !isPending && !isOrganizing) {
        event.preventDefault();
        requestClose();
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
    // `requestClose` carries the answer to "does closing lose anything?", and a stale closure
    // here would be a stale answer to the one question this dialog must not get wrong.
  }, [confirmingClose, isOrganizing, isPending, requestClose]);

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
    setMessage({
      text: `${available.length} rows prepared from your pasted list.`,
      tone: "info",
    });
  }

  /**
   * Sends a turn to Tala, carrying the rows currently on screen, and lays the answer back out.
   *
   * The rows go with it because that is what makes this a conversation rather than a sequence
   * of unrelated pastes. Tala answers with the whole list as it should now stand — the rows
   * that did not change exactly as they read, plus the change asked for — so the answer
   * replaces what is here instead of being appended to it. Appending a corrected list to the
   * list it corrects would double every row.
   *
   * A creator who asks something Tala cannot sort safely gets questions back and keeps every
   * row they already had. Nothing here creates anything: the rows land in the same fields a
   * typed one lands in, and the existing Create button is still the only thing that acts.
   *
   * One turn spends one message from the daily allowance, the same as a question. That is why
   * the plain tab-separated paste below stays: a creator with a tidy spreadsheet should not
   * pay a model to read it.
   */
  async function organize() {
    const text = pastedList.trim();
    if (!text || isOrganizing || isPending) return;

    const carried = partiesFromRows(rows, singleRecipient);
    const turn: AssistantApiMessage[] = [...thread, { content: text, role: "user" }];

    setThread(turn);
    setPastedList("");
    setIsOrganizing(true);
    setTalaStatus(null);
    setMessage(null);

    const result = await requestGuestParties(
      invitation.invitationId,
      guestConversationPayload(turn, carried),
    );

    if (result.status === "refused") {
      // The question stays in the thread so it can be read, and Try again puts it back in the
      // box — a refusal used to leave the creator's own words nowhere they could reach them.
      setTalaStatus({
        retry: () => setPastedList(text),
        text: result.message,
        tone: "danger",
      });
      setIsOrganizing(false);
      return;
    }

    if (result.status === "questions") {
      setThread([...turn, { content: guestQuestionsMessage(result.questions), role: "assistant" }]);
      setTalaStatus({
        text: "Answer what you can and Tala will sort the list from it. Your rows are unchanged.",
        tone: "info",
      });
      setIsOrganizing(false);
      return;
    }

    const kept = result.parties.slice(0, MAX_PARSED_GUEST_PARTIES);
    const before = new Set(carried.map(partyKey));
    const changed = new Set<number>();

    setRows(() => {
      const next = kept.map((party) => {
        const row = rowFromParty(party, nextIdRef.current);
        nextIdRef.current += 1;
        if (!before.has(partyKey(party))) changed.add(row.id);
        return row;
      });
      return next.length > 0 ? next : [emptyRow(nextIdRef.current++)];
    });
    // Only what actually moved. A follow-up that changes one seat count marks one row, so the
    // creator can find the edit instead of re-reading a list that mostly did not change.
    setArrivedRows(changed);
    setInvalidRows(new Set());

    setThread([
      ...turn,
      { content: guestListMessage(kept.length, result.questions), role: "assistant" },
    ]);
    // The count is stated both ways when it moved. A creator who asked to change one row and
    // sees "12 rows, was 40" has been told immediately that the answer was wrong, while
    // nothing has been created and the list is still in front of them to fix.
    setTalaStatus({
      text:
        carried.length > 0 && kept.length !== carried.length
          ? `Your list is now ${kept.length} ${kept.length === 1 ? "row" : "rows"}, from ${carried.length}. Check it before you create anything.`
          : `${kept.length} ${kept.length === 1 ? "row is" : "rows are"} ready to check. Nothing is created until you choose to.`,
      tone: "info",
    });
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
    const filled = rows.filter((row) => !isBlankRow(row));
    if (filled.length === 0) {
      setMessage({ text: "Add at least one name before creating anything.", tone: "danger" });
      window.requestAnimationFrame(() => firstFieldRef.current?.focus());
      return;
    }

    const normalized = filled.map((row) => ({
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
        const row = filled[index];
        if (row) invalid.add(row.id);
      }
    });
    setInvalidRows(invalid);
    if (invalid.size > 0) {
      setMessage({
        text: "Check the highlighted rows. Names and greetings are required, and members cannot exceed seats.",
        tone: "danger",
      });
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
        setMessage({ text: result.message, tone: "danger" });
        return;
      }
      createdCount = result.count;
    } catch {
      setMessage({
        text: "Invitica could not create these guest parties. Check your connection and try again.",
        tone: "danger",
      });
    } finally {
      setIsPending(false);
    }
    if (createdCount !== null) onCreated(createdCount);
  }

  /**
   * What the box should say it is for, which is not the same as whether anything was sent.
   *
   * Three states, and the difference matters. A list on screen means the next message changes
   * it. Questions with no list yet mean the next message answers them. A refused turn leaves
   * the creator's own message in the thread and nothing else — that is still a first paste,
   * and calling it a change would be describing work that does not exist.
   */
  const hasRows = rows.some((row) => row.internalLabel.trim().length > 0);
  const answeringQuestions = !hasRows && thread.at(-1)?.role === "assistant";

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
              onClick={requestClose}
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
            <TalaTaskPanel
              busy={isOrganizing}
              busyLabel={hasRows ? "Tala is updating your list" : "Tala is reading your list"}
              className={styles.taskPanel}
              disabled={isPending}
              hint={
                hasRows
                  ? "Tala can see the rows below, so say what to change in a sentence — a seat count, a greeting, a name, or someone to add."
                  : answeringQuestions
                    ? "Answer what you can in one message. Tala sorts the list from it."
                    : "Names, nicknames, and counts like “+2” in whatever order they are already in. Their names are sent to Invitica’s AI provider to be read, and you check every row below before anything is created."
              }
              inputId="guest-list-paste"
              label={
                hasRows
                  ? "Tell Tala what to change"
                  : answeringQuestions
                    ? "Answer Tala's questions"
                    : "Paste a messy list and let Tala sort it"
              }
              onChange={setPastedList}
              onSend={() => void organize()}
              placeholder={
                hasRows
                  ? "The Santos family is 6, and address Tita Baby as just Baby"
                  : singleRecipient
                    ? "Mia Santos, Ana Cruz, Tita Baby"
                    : "Tita Baby +2, Kuya Jun & Ate Mae, Santos family (5)"
              }
              sendLabel={hasRows || answeringQuestions ? "Send to Tala" : "Organize with Tala"}
              status={talaStatus}
              suggestions={
                hasRows || answeringQuestions
                  ? undefined
                  : singleRecipient
                    ? RECIPIENT_SUGGESTIONS
                    : GUEST_SUGGESTIONS
              }
              thread={thread}
              value={pastedList}
            />
          ) : null}

          {/* Dimmed while a turn runs, because these are the fields the answer is about to
              replace. It is the only part of the dialog whose state is genuinely uncertain. */}
          <div className={styles.bulkRows} data-waiting={isOrganizing || undefined}>
            {rows.map((row, index) => (
              <fieldset
                className={styles.bulkRow}
                data-arrived={arrivedRows.has(row.id) || undefined}
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

          <p
            aria-live="polite"
            className={styles.dialogStatus}
            data-tone={message?.tone ?? "info"}
            role="status"
          >
            {message?.text}
          </p>
          <div className={styles.dialogActions}>
            <button disabled={isPending || isOrganizing} onClick={requestClose} type="button">
              Cancel
            </button>
            <button disabled={isPending || isOrganizing || readyRows.length === 0} type="submit">
              {isPending
                ? "Preparing invitations..."
                : readyRows.length === 0
                  ? singleRecipient
                    ? "Create invitations"
                    : "Create parties"
                  : singleRecipient
                    ? `Create ${readyRows.length} ${readyRows.length === 1 ? "invitation" : "invitations"}`
                    : `Create ${readyRows.length} ${readyRows.length === 1 ? "party" : "parties"}`}
            </button>
          </div>
        </form>
      </section>

      {confirmingClose ? (
        <DiscardChangesDialog
          confirmLabel="Discard"
          description={
            singleRecipient
              ? "Nothing has been created yet. These recipients and your conversation with Tala will be gone."
              : "Nothing has been created yet. These rows and your conversation with Tala will be gone."
          }
          eyebrow={singleRecipient ? "Add recipients" : "Add guests"}
          onDiscard={() => {
            setConfirmingClose(false);
            onClose();
            returnFocusRef.current?.focus();
          }}
          onKeepEditing={() => setConfirmingClose(false)}
          title={singleRecipient ? "Discard these recipients?" : "Discard these guest rows?"}
        />
      ) : null}
    </div>
  );
}
