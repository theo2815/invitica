"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  copyGuestInvitationAction,
  prepareGuestInvitationCopiesAction,
  recordGuestInvitationCopyAction,
  replaceGuestPartyLinkAction,
  restoreGuestPartyAction,
  revokeGuestPartyLinkAction,
  setGuestInvitationSentAction,
  trashGuestPartyAction,
} from "../../server/guests/actions";
import type { GuestInvitationSummary, GuestPartySummary } from "../../server/guests/guests";
import type { InvitationResultSummary } from "../../server/guests/results";
import { buildGeneralInvitationMessage } from "../../server/guests/sharing";
import { Select } from "../forms/Select";
import { Check, MoreHorizontal, Plus, Users } from "../Icons";
import { GuestBulkComposer } from "./GuestBulkComposer";
import styles from "./GuestDesk.module.css";
import { GuestPartyEditor } from "./GuestPartyEditor";

interface GuestDeskProps {
  invitations: readonly GuestInvitationSummary[];
  parties: readonly GuestPartySummary[];
  resultSummary: InvitationResultSummary | null;
  selectedInvitation: GuestInvitationSummary | null;
  trashedParties: readonly GuestPartySummary[];
}

type Confirmation = { kind: "replace" | "revoke" | "trash"; party: GuestPartySummary } | null;

type CopyFeedback = {
  message: string;
  status: "error" | "success";
  target: string;
} | null;

type CopyFallback = { label: string; text: string } | null;

/** Ready-to-send message per guest party, resolved before the creator clicks Copy. */
type PreparedCopies = ReadonlyMap<string, { copyText: string; personalizedUrl: string }>;

type ResponseFilter =
  | "all"
  | "already-sent"
  | "attending"
  | "awaiting"
  | "declined"
  | "not-yet-sent";

function responseState(party: GuestPartySummary): "attending" | "awaiting" | "declined" {
  return party.response?.attendance ?? "awaiting";
}

function responseLabel(party: GuestPartySummary): string {
  if (party.response?.attendance === "attending") return "Attending";
  if (party.response?.attendance === "declined") return "Declined";
  return "Awaiting reply";
}

function formatResponseTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(new Date(value));
}

function confirmationCopy(confirmation: Exclude<Confirmation, null>): {
  action: string;
  description: string;
  eyebrow: string;
  title: string;
} {
  if (confirmation.kind === "trash") {
    return {
      action: "Move to trash",
      description:
        "Its private link will stop working and the party will leave active totals. The retained response and party can be restored from Recently deleted.",
      eyebrow: "Guest party",
      title: `Move ${confirmation.party.internalLabel} to trash?`,
    };
  }
  if (confirmation.kind === "revoke") {
    return {
      action: "Revoke link",
      description:
        "The party will lose personalized access immediately. The general invitation will keep working.",
      eyebrow: "Private link",
      title: "Revoke this personalized link?",
    };
  }
  return {
    action: confirmation.party.linkStatus === "active" ? "Replace & copy" : "Create & copy",
    description:
      confirmation.party.linkStatus === "active"
        ? "The current link will stop working immediately. A fresh private invitation message will be copied for you."
        : "A fresh private link and ready-to-send invitation message will be prepared for this party.",
    eyebrow: "Private link",
    title:
      confirmation.party.linkStatus === "active"
        ? "Replace this personalized link?"
        : "Create a personalized link?",
  };
}

function confirmationPendingLabel(confirmation: Exclude<Confirmation, null>): string {
  if (confirmation.kind === "trash") return "Moving to trash…";
  if (confirmation.kind === "revoke") return "Revoking link…";
  return confirmation.party.linkStatus === "active" ? "Replacing link…" : "Creating link…";
}

export function GuestDesk({
  invitations,
  parties,
  resultSummary,
  selectedInvitation,
  trashedParties,
}: GuestDeskProps) {
  const router = useRouter();
  // The invitation switcher changes a search parameter on a segment that is already
  // mounted, which does not re-trigger `loading.tsx`. Without this transition the click
  // produced no feedback at all for the whole server round trip.
  const [isSelecting, startSelecting] = useTransition();
  const [isRefreshing, startRefreshing] = useTransition();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [copyFallback, setCopyFallback] = useState<CopyFallback>(null);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);
  const [copyingPartyId, setCopyingPartyId] = useState<string | null>(null);
  const [preparedCopies, setPreparedCopies] = useState<PreparedCopies>(() => new Map());
  const [sendingPartyId, setSendingPartyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<GuestPartySummary | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [restoringPartyId, setRestoringPartyId] = useState<string | null>(null);
  const [openPartyMenuId, setOpenPartyMenuId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [responseFilter, setResponseFilter] = useState<ResponseFilter>("all");
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const ledgerHeadingRef = useRef<HTMLHeadingElement>(null);
  const openPartyMenuRef = useRef<HTMLDivElement>(null);
  const partyMenuButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!confirmation) return;
    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        event.preventDefault();
        setConfirmation(null);
        restoreFocusRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [],
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
    window.addEventListener("keydown", handleDialogKeyDown);
    return () => window.removeEventListener("keydown", handleDialogKeyDown);
  }, [confirmation, isPending]);

  useEffect(() => {
    if (!openPartyMenuId) return;
    const partyMenuId = openPartyMenuId;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !openPartyMenuRef.current?.contains(event.target)) {
        setOpenPartyMenuId(null);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenPartyMenuId(null);
      partyMenuButtonRefs.current.get(partyMenuId)?.focus();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openPartyMenuId]);

  const copySucceeded = useCallback((target: string) => {
    setCopyFeedback({
      message: "Invitation message copied. It is ready to paste into any messaging app.",
      status: "success",
      target,
    });
  }, []);

  const copyFailed = useCallback((text: string, target: string, fallbackLabel: string) => {
    setCopyFallback({ label: fallbackLabel, text });
    setCopyFeedback({
      message: "Clipboard access was unavailable. The invitation message is selected below.",
      status: "error",
      target,
    });
    window.requestAnimationFrame(() => {
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
    });
  }, []);

  /**
   * Starts the clipboard write in the same task as the click. Nothing may be awaited
   * before `writeText`: WebKit spends the user gesture on the first await and then
   * rejects the write, which is why copying used to land in the manual box on iOS.
   */
  const writeCopyNow = useCallback(
    (text: string, target: string, fallbackLabel: string): Promise<void> => {
      setCopyFeedback(null);
      setCopyFallback(null);
      if (!navigator.clipboard?.writeText) {
        copyFailed(text, target, fallbackLabel);
        return Promise.resolve();
      }
      try {
        return navigator.clipboard.writeText(text).then(
          () => copySucceeded(target),
          () => copyFailed(text, target, fallbackLabel),
        );
      } catch {
        copyFailed(text, target, fallbackLabel);
        return Promise.resolve();
      }
    },
    [copyFailed, copySucceeded],
  );

  /** Used only when a copy was not prepared in advance; the gesture is already spent. */
  async function writeCopyAfterAwait(text: string, target: string, fallbackLabel: string) {
    setCopyFeedback(null);
    setCopyFallback(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      copySucceeded(target);
    } catch {
      copyFailed(text, target, fallbackLabel);
    }
  }

  const invitationId = selectedInvitation?.invitationId;
  const activePartyIds = parties
    .filter((party) => party.linkStatus === "active")
    .map((party) => party.id)
    .join(",");

  // Prepared in the background after the ledger renders, so the page is never held up
  // by it. A click that arrives first still works through the per-click path below.
  useEffect(() => {
    if (!invitationId || !activePartyIds) return;
    let cancelled = false;

    void (async () => {
      try {
        const result = await prepareGuestInvitationCopiesAction({
          guestPartyIds: activePartyIds.split(","),
          invitationId,
        });
        if (cancelled || result.status === "error") return;
        setPreparedCopies(
          new Map(
            result.copies.map((copy) => [
              copy.guestPartyId,
              { copyText: copy.copyText, personalizedUrl: copy.personalizedUrl },
            ]),
          ),
        );
      } catch {
        // Copy preparation is an optional acceleration. The click path remains available.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePartyIds, invitationId]);

  function copyGeneralInvitation() {
    if (!selectedInvitation || copyingPartyId) return;
    setActionMessage(null);
    setCopyingPartyId("general");
    void writeCopyNow(
      buildGeneralInvitationMessage(selectedInvitation.title, selectedInvitation.genericUrl),
      "general",
      "General invitation message",
    ).finally(() => setCopyingPartyId(null));
  }

  async function copyPersonalInvitation(party: GuestPartySummary) {
    if (!selectedInvitation) return;
    if (copyingPartyId) return;
    if (party.linkStatus !== "active") {
      requestConfirmation(party, "replace", partyMenuButtonRefs.current.get(party.id));
      return;
    }
    setActionMessage(null);

    const prepared = preparedCopies.get(party.id);
    if (prepared) {
      setCopyingPartyId(party.id);
      void writeCopyNow(
        prepared.copyText,
        party.id,
        `Invitation message for ${party.internalLabel}`,
      ).finally(() => setCopyingPartyId(null));
      trackCopy(party.id);
      return;
    }

    setCopyingPartyId(party.id);
    try {
      const result = await copyGuestInvitationAction({
        guestPartyId: party.id,
        invitationId: selectedInvitation.invitationId,
      });
      if (result.status === "error") {
        setActionMessage(result.message);
        return;
      }
      await writeCopyAfterAwait(
        result.copyText,
        party.id,
        `Invitation message for ${party.internalLabel}`,
      );
      trackCopy(party.id);
    } catch {
      setActionMessage(
        "Invitica could not prepare this invitation message. Check your connection and try again.",
      );
    } finally {
      setCopyingPartyId(null);
    }
  }

  /**
   * Bookkeeping, deliberately outside the copy itself: the clipboard already holds the
   * message by the time this runs, so it must never delay the copy and a failure must
   * never be reported as one. Losing a count beats a false alarm.
   */
  function trackCopy(guestPartyId: string) {
    void recordGuestInvitationCopyAction({ guestPartyId })
      .then((result) => {
        if (result.status === "recorded") refreshDesk();
      })
      .catch(() => undefined);
  }

  function refreshDesk() {
    setOpenPartyMenuId(null);
    startRefreshing(() => router.refresh());
  }

  async function toggleSent(party: GuestPartySummary, sent: boolean) {
    if (sendingPartyId || isRefreshing) return;

    setSendingPartyId(party.id);
    setActionMessage(null);
    try {
      const result = await setGuestInvitationSentAction({ guestPartyId: party.id, sent });
      if (result.status === "error") {
        setActionMessage(result.message);
        return;
      }
      setActionMessage(
        sent
          ? `Marked as sent to ${party.internalLabel}.`
          : `${party.internalLabel} is no longer marked as sent.`,
      );
      refreshDesk();
    } catch {
      setActionMessage(
        "Invitica could not update the sent status. Check your connection and try again.",
      );
    } finally {
      setSendingPartyId(null);
    }
  }

  function requestConfirmation(
    party: GuestPartySummary,
    kind: "replace" | "revoke" | "trash",
    restoreFocus?: HTMLElement,
  ) {
    restoreFocusRef.current = restoreFocus ?? partyMenuButtonRefs.current.get(party.id) ?? null;
    setOpenPartyMenuId(null);
    setActionMessage(null);
    setConfirmation({ kind, party });
    window.requestAnimationFrame(() => dialogRef.current?.focus());
  }

  function closeConfirmation() {
    if (isPending) return;
    setConfirmation(null);
    restoreFocusRef.current?.focus();
  }

  async function confirmAction() {
    if (!confirmation || !selectedInvitation || isPending || isRefreshing) return;
    const pendingConfirmation = confirmation;
    setIsPending(true);
    setActionMessage(null);

    try {
      if (pendingConfirmation.kind === "replace") {
        const result = await replaceGuestPartyLinkAction({
          guestPartyId: pendingConfirmation.party.id,
          invitationId: selectedInvitation.invitationId,
        });
        if (result.status === "error") {
          setActionMessage(result.message);
          return;
        }
        const replacedParty = pendingConfirmation.party;
        setConfirmation(null);
        // The replacement invalidates whatever was prepared for this party, and the
        // action already returned the message for the link it just created.
        setPreparedCopies((current) => {
          const next = new Map(current);
          next.set(replacedParty.id, {
            copyText: result.copyText,
            personalizedUrl: result.personalizedUrl,
          });
          return next;
        });
        await writeCopyAfterAwait(
          result.copyText,
          replacedParty.id,
          `Invitation message for ${replacedParty.internalLabel}`,
        );
        setActionMessage("A fresh private link is active. The previous link no longer works.");
        refreshDesk();
        partyMenuButtonRefs.current.get(replacedParty.id)?.focus();
        return;
      }

      const confirmedParty = pendingConfirmation.party;
      const baseInput = {
        expectedRevision: confirmedParty.revision,
        guestPartyId: confirmedParty.id,
        invitationId: selectedInvitation.invitationId,
      };
      const result =
        pendingConfirmation.kind === "revoke"
          ? await revokeGuestPartyLinkAction({
              guestPartyId: confirmedParty.id,
              invitationId: selectedInvitation.invitationId,
            })
          : await trashGuestPartyAction(baseInput);
      if (result.status === "error") {
        setActionMessage(result.message);
        return;
      }

      const completedKind = pendingConfirmation.kind;
      setConfirmation(null);
      // Both paths revoke the link, so any prepared message for it is now dead.
      setPreparedCopies((current) => {
        const next = new Map(current);
        next.delete(confirmedParty.id);
        return next;
      });
      setActionMessage(
        completedKind === "revoke"
          ? "The private link was revoked. The general invitation remains available."
          : "The party was moved to Recently deleted and its private link was revoked.",
      );
      refreshDesk();
      window.requestAnimationFrame(() => {
        if (completedKind === "trash") ledgerHeadingRef.current?.focus();
        else partyMenuButtonRefs.current.get(confirmedParty.id)?.focus();
      });
    } catch {
      setActionMessage(
        "Invitica could not complete this guest action. Check your connection and try again.",
      );
    } finally {
      setIsPending(false);
    }
  }

  async function restoreParty(party: GuestPartySummary) {
    if (!selectedInvitation || restoringPartyId || isRefreshing) return;
    setRestoringPartyId(party.id);
    setActionMessage(null);
    try {
      const result = await restoreGuestPartyAction({
        expectedRevision: party.revision,
        guestPartyId: party.id,
        invitationId: selectedInvitation.invitationId,
      });
      if (result.status === "error") {
        setActionMessage(result.message);
        return;
      }
      setActionMessage("The guest party was restored. Create a fresh private link when ready.");
      refreshDesk();
      window.requestAnimationFrame(() => ledgerHeadingRef.current?.focus());
    } catch {
      setActionMessage(
        "Invitica could not restore this guest party. Check your connection and try again.",
      );
    } finally {
      setRestoringPartyId(null);
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("en-PH");
  const filteredParties = parties
    .filter((party) => {
      const matchesResponse =
        responseFilter === "all" ||
        (responseFilter === "not-yet-sent" && party.markedSentAt === null) ||
        (responseFilter === "already-sent" && party.markedSentAt !== null) ||
        responseState(party) === responseFilter;
      if (!matchesResponse) return false;
      if (!normalizedQuery) return true;
      return [
        party.internalLabel,
        party.recipientName,
        ...party.guestMembers.map(({ name }) => name),
      ].some((value) => value.toLocaleLowerCase("en-PH").includes(normalizedQuery));
    })
    .sort((left, right) => {
      const sentOrder = Number(left.markedSentAt !== null) - Number(right.markedSentAt !== null);
      const responseOrder =
        Date.parse(right.response?.updatedAt ?? "1970-01-01") -
        Date.parse(left.response?.updatedAt ?? "1970-01-01");
      return (
        sentOrder || responseOrder || left.internalLabel.localeCompare(right.internalLabel, "en-PH")
      );
    });

  return (
    <div aria-busy={isSelecting || isRefreshing || undefined} className={styles.desk}>
      <section aria-labelledby="invitation-context-heading" className={styles.context}>
        <div>
          <p className={styles.eyebrow}>Invitation context</p>
          <h2 id="invitation-context-heading">
            {selectedInvitation?.title ?? "Choose a published invitation"}
          </h2>
          <p>
            {selectedInvitation
              ? "Each party receives one private invitation and responds together."
              : "Guest parties become available after delivery is confirmed."}
          </p>
        </div>
        {invitations.length > 0 ? (
          <div className={styles.invitationPickerGroup}>
            <Select
              className={styles.invitationPicker}
              disabled={isSelecting || isRefreshing}
              id="guest-invitation"
              label="Published invitation"
              onChange={(nextInvitationId) => {
                if (isSelecting || nextInvitationId === (selectedInvitation?.invitationId ?? "")) {
                  return;
                }
                // Clearing these first stops a stale ledger's prepared messages and
                // copy feedback from appearing to belong to the invitation arriving next.
                setPreparedCopies(new Map());
                setCopyFeedback(null);
                setCopyFallback(null);
                setActionMessage(null);
                startSelecting(() =>
                  router.push(
                    nextInvitationId
                      ? `/dashboard/guests?invitationId=${encodeURIComponent(nextInvitationId)}`
                      : "/dashboard/guests",
                  ),
                );
              }}
              options={[
                { label: "Select an invitation", value: "" },
                ...invitations.map((invitation) => ({
                  label: invitation.title,
                  value: invitation.invitationId,
                })),
              ]}
              value={selectedInvitation?.invitationId ?? ""}
            />
            <p aria-live="polite" className={styles.selectionStatus}>
              {isSelecting ? "Loading this invitation…" : null}
            </p>
          </div>
        ) : (
          <Link href="/dashboard/invitations">View invitations</Link>
        )}
      </section>

      {isSelecting ? (
        <section
          aria-label="Loading the selected invitation"
          className={styles.ledgerSkeleton}
          role="status"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span className={styles.visuallyHidden}>Loading the selected invitation…</span>
        </section>
      ) : null}

      {selectedInvitation && !isSelecting ? (
        <>
          <section aria-labelledby="general-link-heading" className={styles.generalLink}>
            <div>
              <p className={styles.eyebrow}>General invitation</p>
              <h2 id="general-link-heading">A welcoming message for every guest</h2>
              <p>It opens the invitation for reading but does not authorize a party RSVP.</p>
            </div>
            <div className={styles.copyStack}>
              <button
                aria-label={copyingPartyId === "general" ? "Copying general invitation" : undefined}
                className={styles.copyInvitationButton}
                disabled={copyingPartyId !== null || isRefreshing}
                onClick={() => copyGeneralInvitation()}
                type="button"
              >
                {copyingPartyId === "general" ? (
                  "Copying…"
                ) : copyFeedback?.target === "general" && copyFeedback.status === "success" ? (
                  <>
                    <Check /> Copied
                  </>
                ) : (
                  "Copy general invitation"
                )}
              </button>
              {copyFeedback?.target === "general" ? (
                <p
                  aria-live="polite"
                  className={
                    copyFeedback.status === "success" ? styles.copySuccess : styles.copyError
                  }
                  role="status"
                >
                  {copyFeedback.message}
                </p>
              ) : null}
            </div>
          </section>

          {copyFallback ? (
            <section aria-labelledby="copy-fallback-heading" className={styles.linkReveal}>
              <span aria-hidden="true">
                <Check />
              </span>
              <div>
                <p className={styles.eyebrow}>Manual copy</p>
                <h2 id="copy-fallback-heading">{copyFallback.label}</h2>
                <p>Copy the selected plain-text message, including its complete invitation link.</p>
                <textarea
                  aria-label={copyFallback.label}
                  readOnly
                  ref={fallbackRef}
                  rows={5}
                  value={copyFallback.text}
                />
              </div>
            </section>
          ) : null}

          <section aria-label="Guest overview" className={styles.summary}>
            <article>
              <span>Guest parties</span>
              <strong>{resultSummary?.guestPartyCount ?? 0}</strong>
              <small>Households and groups</small>
            </article>
            <article>
              <span>Reserved seats</span>
              <strong>{resultSummary?.reservedSeats ?? 0}</strong>
              <small>Maximum party capacity</small>
            </article>
            <article>
              <span>Attending guests</span>
              <strong>{resultSummary?.attendingGuests ?? 0}</strong>
              <small>{resultSummary?.attendingParties ?? 0} attending parties</small>
            </article>
            <article>
              <span>Awaiting reply</span>
              <strong>{resultSummary?.awaitingParties ?? 0}</strong>
              <small>Parties without a response</small>
            </article>
            <article>
              <span>Declined</span>
              <strong>{resultSummary?.declinedParties ?? 0}</strong>
              <small>Declined parties</small>
            </article>
            <article>
              <span>Views</span>
              <strong>{resultSummary?.viewCount ?? 0}</strong>
              <small>Approximate page loads</small>
            </article>
          </section>

          <section aria-labelledby="party-ledger-heading" className={styles.ledger}>
            <header>
              <div>
                <p className={styles.eyebrow}>Private guest ledger</p>
                <h2 id="party-ledger-heading" ref={ledgerHeadingRef} tabIndex={-1}>
                  Guest parties
                </h2>
              </div>
              <button
                aria-label="Add guests"
                className={styles.primaryAction}
                disabled={isRefreshing}
                onClick={() => {
                  setActionMessage(null);
                  setCreateOpen(true);
                }}
                ref={createButtonRef}
                type="button"
              >
                <Plus /> Add guests
              </button>
            </header>

            {parties.length === 0 ? (
              <div className={styles.empty}>
                <span aria-hidden="true">
                  <Users />
                </span>
                <h3>No guest parties yet</h3>
                <p>Add one person, a family, or paste a full guest list in a single action.</p>
                <button disabled={isRefreshing} onClick={() => setCreateOpen(true)} type="button">
                  Add the first guests
                </button>
              </div>
            ) : (
              <>
                <div className={styles.ledgerControls}>
                  <label>
                    <span>Search parties or guests</span>
                    <input
                      onChange={(event) => setQuery(event.currentTarget.value)}
                      placeholder="Search the guest ledger"
                      type="search"
                      value={query}
                    />
                  </label>
                  <Select
                    className={styles.responseFilter}
                    id="guest-response-filter"
                    label="Response"
                    onChange={(nextValue) => setResponseFilter(nextValue as typeof responseFilter)}
                    options={[
                      { label: "All responses", value: "all" },
                      { label: "Not Yet Sent", value: "not-yet-sent" },
                      { label: "Already Sent", value: "already-sent" },
                      { label: "Attending", value: "attending" },
                      { label: "Declined", value: "declined" },
                      { label: "Awaiting reply", value: "awaiting" },
                    ]}
                    value={responseFilter}
                  />
                </div>

                {filteredParties.length === 0 ? (
                  <div className={styles.filteredEmpty} role="status">
                    <h3>No matching guest parties</h3>
                    <p>Try a different search or response filter.</p>
                  </div>
                ) : (
                  <div className={styles.tableFrame}>
                    <table aria-label="Guest party response ledger" className={styles.ledgerTable}>
                      <thead>
                        <tr>
                          <th scope="col">Guest party</th>
                          <th scope="col">RSVP</th>
                          <th scope="col">Message</th>
                          <th scope="col">Invitation</th>
                          <th scope="col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredParties.map((party) => (
                          <tr data-pending={copyingPartyId === party.id} key={party.id}>
                            <td data-label="Party">
                              <div className={styles.partyIdentity}>
                                <h3>{party.internalLabel}</h3>
                                <p>Envelope: {party.recipientName}</p>
                                {party.guestMembers.length > 0 ? (
                                  <details>
                                    <summary>
                                      {party.guestMembers.length} named{" "}
                                      {party.guestMembers.length === 1 ? "guest" : "guests"}
                                    </summary>
                                    <ul className={styles.memberList}>
                                      {party.guestMembers.map((member) => (
                                        <li key={member.id}>
                                          <span>{member.name}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                ) : null}
                              </div>
                            </td>
                            <td data-label="RSVP">
                              <div className={styles.rsvpSummary}>
                                <span
                                  className={styles.responseBadge}
                                  data-response={responseState(party)}
                                >
                                  {responseLabel(party)}
                                </span>
                                <strong>
                                  {party.response?.attendance === "attending"
                                    ? `${party.response.attendeeCount} of ${party.capacity} attending`
                                    : `0 of ${party.capacity} attending`}
                                </strong>
                                {party.response ? (
                                  <span className={styles.responseUpdated}>
                                    Updated{" "}
                                    <time dateTime={party.response.updatedAt}>
                                      {formatResponseTime(party.response.updatedAt)}
                                    </time>
                                  </span>
                                ) : (
                                  <span className={styles.mutedValue}>No response yet</span>
                                )}
                              </div>
                            </td>
                            <td data-label="Message">
                              {party.response?.message ? (
                                party.response.message.length > 120 ? (
                                  <details className={styles.messageDetails}>
                                    <summary>
                                      <span aria-hidden="true" className={styles.messageExcerpt}>
                                        {party.response.message}
                                      </span>
                                      <span className={styles.messageToggle}>
                                        <span className={styles.messageOpenLabel}>
                                          Read full message
                                        </span>
                                        <span className={styles.messageCloseLabel}>
                                          Hide full message
                                        </span>
                                      </span>
                                    </summary>
                                    <p>{party.response.message}</p>
                                  </details>
                                ) : (
                                  <p className={styles.messageText}>{party.response.message}</p>
                                )
                              ) : (
                                <span className={styles.mutedValue}>No message</span>
                              )}
                            </td>
                            <td data-label="Invitation">
                              <div className={styles.linkControl}>
                                <span
                                  className={
                                    party.linkStatus === "active" ? styles.active : styles.revoked
                                  }
                                >
                                  {party.linkStatus === "active"
                                    ? "Private link active"
                                    : "Link revoked"}
                                </span>
                                <button
                                  aria-label={
                                    copyingPartyId === party.id
                                      ? `Preparing invitation for ${party.internalLabel}`
                                      : copyFeedback?.target === party.id &&
                                          copyFeedback.status === "success"
                                        ? `Copied invitation for ${party.internalLabel}`
                                        : party.linkStatus === "active"
                                          ? `Copy invitation for ${party.internalLabel}`
                                          : `Create and copy invitation for ${party.internalLabel}`
                                  }
                                  className={`${styles.rowCopyAction} ${styles.invitationCopyAction}`}
                                  disabled={copyingPartyId !== null || isRefreshing}
                                  onClick={() => void copyPersonalInvitation(party)}
                                  type="button"
                                >
                                  {copyingPartyId === party.id
                                    ? "Preparing..."
                                    : copyFeedback?.target === party.id &&
                                        copyFeedback.status === "success"
                                      ? "Copied"
                                      : party.linkStatus === "active"
                                        ? "Copy invitation"
                                        : "Create & copy invitation"}
                                </button>
                                {copyFeedback?.target === party.id ? (
                                  <span aria-live="polite" className={styles.visuallyHidden}>
                                    {copyFeedback.message}
                                  </span>
                                ) : null}

                                <label className={styles.sentCheck}>
                                  <input
                                    checked={party.markedSentAt !== null}
                                    disabled={sendingPartyId === party.id || isRefreshing}
                                    onChange={(event) =>
                                      void toggleSent(party, event.currentTarget.checked)
                                    }
                                    type="checkbox"
                                  />
                                  <span className={styles.sentLabel}>
                                    {party.markedSentAt
                                      ? `Sent ${formatResponseTime(party.markedSentAt)}`
                                      : "I have sent this"}
                                  </span>
                                </label>

                                {/*
                                  Copying is evidence of intent, never of delivery — a creator
                                  may copy and then never paste. Shown quietly so the checkbox
                                  above stays the answer to "did this guest get their invitation?".
                                */}
                                {party.copyCount > 0 ? (
                                  <span className={styles.copyHint}>
                                    Copied {party.copyCount}
                                    {party.copyCount === 1 ? " time" : " times"}
                                    {party.lastCopiedAt
                                      ? `, last ${formatResponseTime(party.lastCopiedAt)}`
                                      : null}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td data-label="Actions">
                              <div
                                className={styles.partyActionMenu}
                                ref={openPartyMenuId === party.id ? openPartyMenuRef : undefined}
                              >
                                <button
                                  aria-expanded={openPartyMenuId === party.id}
                                  aria-haspopup="true"
                                  aria-label={`More actions for ${party.internalLabel}`}
                                  className={styles.moreAction}
                                  disabled={isRefreshing}
                                  onClick={() =>
                                    setOpenPartyMenuId((current) =>
                                      current === party.id ? null : party.id,
                                    )
                                  }
                                  ref={(element) => {
                                    if (element) partyMenuButtonRefs.current.set(party.id, element);
                                    else partyMenuButtonRefs.current.delete(party.id);
                                  }}
                                  type="button"
                                >
                                  <MoreHorizontal />
                                  <span>More</span>
                                </button>
                                <div
                                  className={styles.partyActions}
                                  data-open={openPartyMenuId === party.id}
                                >
                                  <button
                                    aria-label={`Edit ${party.internalLabel}`}
                                    onClick={() => {
                                      setActionMessage(null);
                                      setOpenPartyMenuId(null);
                                      setEditingParty(party);
                                    }}
                                    type="button"
                                  >
                                    Edit party
                                  </button>
                                  <button
                                    onClick={() =>
                                      requestConfirmation(
                                        party,
                                        "replace",
                                        partyMenuButtonRefs.current.get(party.id),
                                      )
                                    }
                                    type="button"
                                  >
                                    {party.linkStatus === "active"
                                      ? "Replace private link"
                                      : "Create private link"}
                                  </button>
                                  {party.linkStatus === "active" ? (
                                    <button
                                      className={styles.dangerAction}
                                      onClick={() =>
                                        requestConfirmation(
                                          party,
                                          "revoke",
                                          partyMenuButtonRefs.current.get(party.id),
                                        )
                                      }
                                      type="button"
                                    >
                                      Revoke private link
                                    </button>
                                  ) : null}
                                  <button
                                    className={styles.dangerAction}
                                    onClick={() =>
                                      requestConfirmation(
                                        party,
                                        "trash",
                                        partyMenuButtonRefs.current.get(party.id),
                                      )
                                    }
                                    type="button"
                                  >
                                    Move party to trash
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>

          {trashedParties.length > 0 ? (
            <details className={styles.trashPanel}>
              <summary>Recently deleted ({trashedParties.length})</summary>
              <p>Restored parties return without an active private link.</p>
              <ul>
                {trashedParties.map((party) => (
                  <li key={party.id}>
                    <span>
                      <strong>{party.internalLabel}</strong>
                      <small>{party.recipientName}</small>
                    </span>
                    <button
                      disabled={restoringPartyId !== null || isRefreshing}
                      onClick={() => void restoreParty(party)}
                      type="button"
                    >
                      {restoringPartyId === party.id ? "Restoring…" : "Restore"}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}

      <p aria-live="polite" className={styles.status} role="status">
        {confirmation ? null : actionMessage}
      </p>

      {createOpen && selectedInvitation ? (
        <GuestBulkComposer
          invitation={selectedInvitation}
          onClose={() => {
            setCreateOpen(false);
            createButtonRef.current?.focus();
          }}
          onCreated={(count) => {
            setCreateOpen(false);
            setActionMessage(
              `${count} ${count === 1 ? "guest party is" : "guest parties are"} ready to share.`,
            );
            refreshDesk();
            window.requestAnimationFrame(() => createButtonRef.current?.focus());
          }}
          returnFocusRef={createButtonRef}
        />
      ) : null}

      {editingParty && selectedInvitation ? (
        <GuestPartyEditor
          invitationId={selectedInvitation.invitationId}
          onClose={() => {
            const editedPartyId = editingParty.id;
            setEditingParty(null);
            window.requestAnimationFrame(() =>
              partyMenuButtonRefs.current.get(editedPartyId)?.focus(),
            );
          }}
          onUpdated={() => {
            const editedPartyId = editingParty.id;
            setEditingParty(null);
            setActionMessage(
              "The guest party was updated. Its private link and RSVP are unchanged.",
            );
            refreshDesk();
            window.requestAnimationFrame(() =>
              partyMenuButtonRefs.current.get(editedPartyId)?.focus(),
            );
          }}
          party={editingParty}
        />
      ) : null}

      {confirmation ? (
        <div className={styles.backdrop}>
          <section
            aria-describedby="guest-confirmation-description"
            aria-labelledby="guest-confirmation-title"
            aria-modal="true"
            aria-busy={isPending || undefined}
            className={styles.dialog}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <p className={styles.eyebrow}>{confirmationCopy(confirmation).eyebrow}</p>
            <h2 id="guest-confirmation-title">{confirmationCopy(confirmation).title}</h2>
            <p id="guest-confirmation-description">{confirmationCopy(confirmation).description}</p>
            {actionMessage ? (
              <p className={styles.dialogStatus} role="alert">
                {actionMessage}
              </p>
            ) : null}
            <div className={styles.dialogActions}>
              <button disabled={isPending} onClick={closeConfirmation} type="button">
                Cancel
              </button>
              <button
                className={confirmation.kind === "replace" ? undefined : styles.confirmDanger}
                disabled={isPending || isRefreshing}
                onClick={() => void confirmAction()}
                type="button"
              >
                {isPending
                  ? confirmationPendingLabel(confirmation)
                  : confirmationCopy(confirmation).action}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
