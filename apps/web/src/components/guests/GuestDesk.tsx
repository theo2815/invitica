"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  createGuestPartyAction,
  replaceGuestPartyLinkAction,
  revokeGuestPartyLinkAction,
} from "../../server/guests/actions";
import type { GuestInvitationSummary, GuestPartySummary } from "../../server/guests/guests";
import type { InvitationResultSummary } from "../../server/guests/results";
import { Select } from "../forms/Select";
import { Check, MoreHorizontal, Plus, Users } from "../Icons";
import styles from "./GuestDesk.module.css";

interface GuestDeskProps {
  invitations: readonly GuestInvitationSummary[];
  parties: readonly GuestPartySummary[];
  resultSummary: InvitationResultSummary | null;
  selectedInvitation: GuestInvitationSummary | null;
}

type Confirmation = { guestPartyId: string; kind: "replace" | "revoke" } | null;

type CopyFeedback = {
  kind: "general" | "personalized";
  message: string;
  status: "error" | "success";
} | null;

function splitGuestNames(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

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

export function GuestDesk({
  invitations,
  parties,
  resultSummary,
  selectedInvitation,
}: GuestDeskProps) {
  const router = useRouter();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [openPartyMenuId, setOpenPartyMenuId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [revealedLink, setRevealedLink] = useState<string | null>(null);
  const [responseFilter, setResponseFilter] = useState<
    "all" | "attending" | "awaiting" | "declined"
  >("all");
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const generalLinkInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const openPartyMenuRef = useRef<HTMLDivElement>(null);
  const partyMenuButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const dialogOpen = createOpen || confirmation !== null;
  useEffect(() => {
    if (!dialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        setCreateOpen(false);
        setConfirmation(null);
        restoreFocusRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href]",
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
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialogOpen, isPending]);

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
      const trigger = partyMenuButtonRefs.current.get(partyMenuId);
      setOpenPartyMenuId(null);
      trigger?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openPartyMenuId]);

  function openCreate() {
    restoreFocusRef.current = createButtonRef.current;
    setActionMessage(null);
    setCreateOpen(true);
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  }

  function closeDialog() {
    if (isPending) return;
    setCreateOpen(false);
    setConfirmation(null);
    restoreFocusRef.current?.focus();
  }

  async function copyLink(value: string, kind: "general" | "personalized") {
    setActionMessage(null);
    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(value);
      const message =
        kind === "general"
          ? "General link copied to your clipboard."
          : "Personalized link copied to your clipboard.";
      setCopyFeedback({ kind, message, status: "success" });
      setActionMessage(message);
    } catch {
      const input = kind === "general" ? generalLinkInputRef.current : linkInputRef.current;
      input?.focus();
      input?.select();
      const message = "Copy was unavailable. The link is selected for manual copying.";
      setCopyFeedback({ kind, message, status: "error" });
      setActionMessage(message);
    }
  }

  async function submitParty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvitation) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const capacity = Number(data.get("capacity"));
    const guestNames = splitGuestNames(String(data.get("guestNames") ?? ""));
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
      setActionMessage("Party capacity must be between 1 and 50.");
      return;
    }
    if (guestNames.length > capacity) {
      setActionMessage("Named guests cannot exceed the party capacity.");
      return;
    }

    setIsPending(true);
    setActionMessage(null);
    const result = await createGuestPartyAction({
      capacity,
      guestNames,
      internalLabel: data.get("internalLabel"),
      invitationId: selectedInvitation.invitationId,
      recipientName: data.get("recipientName"),
    });
    setIsPending(false);
    if (result.status === "error") {
      setActionMessage(result.message);
      return;
    }
    setRevealedLink(result.personalizedUrl);
    setCreateOpen(false);
    form.reset();
    setActionMessage(
      "Guest party saved. Copy its personalized link now; it cannot be shown again.",
    );
    router.refresh();
    window.requestAnimationFrame(() => linkInputRef.current?.focus());
  }

  function requestConfirmation(
    event: React.MouseEvent<HTMLButtonElement>,
    guestPartyId: string,
    kind: "replace" | "revoke",
    restoreFocus?: HTMLButtonElement,
  ) {
    const usesMobileMenu =
      typeof window.matchMedia === "function" && window.matchMedia("(max-width: 700px)").matches;
    restoreFocusRef.current = usesMobileMenu
      ? (restoreFocus ?? event.currentTarget)
      : event.currentTarget;
    setOpenPartyMenuId(null);
    setActionMessage(null);
    setConfirmation({ guestPartyId, kind });
    window.requestAnimationFrame(() => dialogRef.current?.focus());
  }

  async function confirmLinkAction() {
    if (!confirmation || !selectedInvitation) return;
    setIsPending(true);
    setActionMessage(null);
    if (confirmation.kind === "replace") {
      const result = await replaceGuestPartyLinkAction({
        guestPartyId: confirmation.guestPartyId,
        invitationId: selectedInvitation.invitationId,
      });
      setIsPending(false);
      if (result.status === "error") {
        setActionMessage(result.message);
        return;
      }
      setRevealedLink(result.personalizedUrl);
      setActionMessage("A fresh personalized link is ready. The previous link no longer works.");
      setConfirmation(null);
      router.refresh();
      window.requestAnimationFrame(() => linkInputRef.current?.focus());
      return;
    }

    const result = await revokeGuestPartyLinkAction({
      guestPartyId: confirmation.guestPartyId,
      invitationId: selectedInvitation.invitationId,
    });
    setIsPending(false);
    if (result.status === "error") {
      setActionMessage(result.message);
      return;
    }
    setConfirmation(null);
    setActionMessage(
      "The personalized link was revoked. The general invitation remains available.",
    );
    router.refresh();
    restoreFocusRef.current?.focus();
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("en-PH");
  const filteredParties = parties
    .filter((party) => {
      const matchesResponse = responseFilter === "all" || responseState(party) === responseFilter;
      if (!matchesResponse) return false;
      if (!normalizedQuery) return true;
      return [party.internalLabel, party.recipientName, ...party.guestNames].some((value) =>
        value.toLocaleLowerCase("en-PH").includes(normalizedQuery),
      );
    })
    .sort((left, right) => {
      const responseOrder =
        Date.parse(right.response?.updatedAt ?? "1970-01-01") -
        Date.parse(left.response?.updatedAt ?? "1970-01-01");
      return responseOrder || left.internalLabel.localeCompare(right.internalLabel, "en-PH");
    });

  return (
    <div className={styles.desk}>
      <section aria-labelledby="invitation-context-heading" className={styles.context}>
        <div>
          <p className={styles.eyebrow}>Invitation context</p>
          <h2 id="invitation-context-heading">
            {selectedInvitation?.title ?? "Choose a published invitation"}
          </h2>
          <p>
            {selectedInvitation
              ? "The general link stays welcoming for everyone. Personalized links add one private party greeting."
              : "Guest parties become available after delivery is confirmed."}
          </p>
        </div>
        {invitations.length > 0 ? (
          <Select
            className={styles.invitationPicker}
            id="guest-invitation"
            label="Published invitation"
            onChange={(invitationId) => {
              router.push(
                invitationId
                  ? `/dashboard/guests?invitationId=${encodeURIComponent(invitationId)}`
                  : "/dashboard/guests",
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
        ) : (
          <Link href="/dashboard/invitations">View invitations</Link>
        )}
      </section>

      {selectedInvitation ? (
        <>
          <section aria-labelledby="general-link-heading" className={styles.generalLink}>
            <div>
              <p className={styles.eyebrow}>General share link</p>
              <h2 id="general-link-heading">A welcoming link for every guest</h2>
              <p>
                It opens with the invitation fallback greeting and does not authorize a party RSVP.
              </p>
            </div>
            <div className={styles.copyStack}>
              <div className={styles.copyField}>
                <input
                  aria-label="General invitation link"
                  readOnly
                  ref={generalLinkInputRef}
                  value={selectedInvitation.genericUrl}
                />
                <button
                  onClick={() => void copyLink(selectedInvitation.genericUrl, "general")}
                  type="button"
                >
                  {copyFeedback?.kind === "general" && copyFeedback.status === "success" ? (
                    <>
                      <Check /> Copied
                    </>
                  ) : (
                    "Copy general link"
                  )}
                </button>
              </div>
              {copyFeedback?.kind === "general" ? (
                <p
                  className={
                    copyFeedback.status === "success" ? styles.copySuccess : styles.copyError
                  }
                  aria-live="polite"
                  role="status"
                >
                  {copyFeedback.message}
                </p>
              ) : null}
            </div>
          </section>

          {revealedLink ? (
            <section aria-labelledby="new-link-heading" className={styles.linkReveal}>
              <span aria-hidden="true">
                <Check />
              </span>
              <div>
                <p className={styles.eyebrow}>Personalized link ready</p>
                <h2 id="new-link-heading">Copy this private link now</h2>
                <p>
                  For guest privacy, Invitica stores only its keyed hash and cannot show this exact
                  link again.
                </p>
                <div className={styles.copyStack}>
                  <div className={styles.copyField}>
                    <input
                      aria-label="New personalized invitation link"
                      readOnly
                      ref={linkInputRef}
                      value={revealedLink}
                    />
                    <button
                      onClick={() => void copyLink(revealedLink, "personalized")}
                      type="button"
                    >
                      {copyFeedback?.kind === "personalized" &&
                      copyFeedback.status === "success" ? (
                        <>
                          <Check /> Copied
                        </>
                      ) : (
                        "Copy personalized link"
                      )}
                    </button>
                  </div>
                  {copyFeedback?.kind === "personalized" ? (
                    <p
                      className={
                        copyFeedback.status === "success" ? styles.copySuccess : styles.copyError
                      }
                      aria-live="polite"
                      role="status"
                    >
                      {copyFeedback.message}
                    </p>
                  ) : null}
                </div>
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
                <h2 id="party-ledger-heading">Guest parties</h2>
              </div>
              <button
                aria-label="Add guest party"
                className={styles.primaryAction}
                onClick={openCreate}
                ref={createButtonRef}
                type="button"
              >
                <Plus />
                <span className={styles.desktopActionLabel}>Add guest party</span>
                <span className={styles.mobileActionLabel}>Add party</span>
              </button>
            </header>

            {parties.length === 0 ? (
              <div className={styles.empty}>
                <span aria-hidden="true">
                  <Users />
                </span>
                <h3>No guest parties yet</h3>
                <p>Add one household or group to prepare its addressed invitation link.</p>
                <button onClick={openCreate} type="button">
                  Add the first party
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
                          <th scope="col">Party</th>
                          <th scope="col">Response</th>
                          <th scope="col">Seats</th>
                          <th scope="col">Message</th>
                          <th scope="col">Updated</th>
                          <th scope="col">Private link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredParties.map((party) => (
                          <tr key={party.id}>
                            <td data-label="Party">
                              <div className={styles.partyIdentity}>
                                <h3>{party.internalLabel}</h3>
                                <p>Envelope: {party.recipientName}</p>
                                {party.guestNames.length > 0 ? (
                                  <details>
                                    <summary>
                                      {party.guestNames.length} named{" "}
                                      {party.guestNames.length === 1 ? "guest" : "guests"}
                                    </summary>
                                    <p>{party.guestNames.join(", ")}</p>
                                  </details>
                                ) : null}
                              </div>
                            </td>
                            <td data-label="Response">
                              <span
                                className={styles.responseBadge}
                                data-response={responseState(party)}
                              >
                                {responseLabel(party)}
                              </span>
                              {party.response?.attendance === "attending" ? (
                                <small>{party.response.attendeeCount} attending</small>
                              ) : null}
                            </td>
                            <td data-label="Seats">
                              <span>
                                {party.response?.attendance === "attending"
                                  ? `${party.response.attendeeCount} / ${party.capacity}`
                                  : `0 / ${party.capacity}`}
                              </span>
                            </td>
                            <td data-label="Message">
                              {party.response?.message ? (
                                <details className={styles.messageDetails}>
                                  <summary>Read message</summary>
                                  <p>{party.response.message}</p>
                                </details>
                              ) : (
                                <span className={styles.mutedValue}>No message</span>
                              )}
                            </td>
                            <td data-label="Updated">
                              {party.response ? (
                                <time dateTime={party.response.updatedAt}>
                                  {formatResponseTime(party.response.updatedAt)}
                                </time>
                              ) : (
                                <span className={styles.mutedValue}>Not yet</span>
                              )}
                            </td>
                            <td data-label="Private link">
                              <div className={styles.linkControl}>
                                <span
                                  className={
                                    party.linkStatus === "active" ? styles.active : styles.revoked
                                  }
                                >
                                  {party.linkStatus === "active" ? "Link active" : "Link revoked"}
                                </span>
                                <div
                                  className={styles.partyActionMenu}
                                  ref={openPartyMenuId === party.id ? openPartyMenuRef : undefined}
                                >
                                  <button
                                    aria-expanded={openPartyMenuId === party.id}
                                    aria-haspopup="true"
                                    aria-label={`More actions for ${party.internalLabel}`}
                                    className={styles.moreAction}
                                    onClick={() =>
                                      setOpenPartyMenuId((current) =>
                                        current === party.id ? null : party.id,
                                      )
                                    }
                                    ref={(element) => {
                                      if (element)
                                        partyMenuButtonRefs.current.set(party.id, element);
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
                                      onClick={(event) =>
                                        requestConfirmation(
                                          event,
                                          party.id,
                                          "replace",
                                          partyMenuButtonRefs.current.get(party.id),
                                        )
                                      }
                                      type="button"
                                    >
                                      {party.linkStatus === "active"
                                        ? "Replace link"
                                        : "Create new link"}
                                    </button>
                                    {party.linkStatus === "active" ? (
                                      <button
                                        className={styles.dangerAction}
                                        onClick={(event) =>
                                          requestConfirmation(
                                            event,
                                            party.id,
                                            "revoke",
                                            partyMenuButtonRefs.current.get(party.id),
                                          )
                                        }
                                        type="button"
                                      >
                                        Revoke link
                                      </button>
                                    ) : null}
                                  </div>
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
        </>
      ) : null}

      <p aria-live="polite" className={styles.status} role="status">
        {actionMessage}
      </p>

      {createOpen ? (
        <div className={styles.backdrop}>
          <section
            aria-describedby="create-party-description"
            aria-labelledby="create-party-title"
            aria-modal="true"
            className={styles.dialog}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <p className={styles.eyebrow}>New guest party</p>
            <h2 id="create-party-title">Prepare one addressed invitation</h2>
            <p id="create-party-description">
              The internal label stays in your ledger. The envelope greeting is visible to anyone
              holding the personalized link.
            </p>
            <form onSubmit={(event) => void submitParty(event)}>
              <label>
                <span>Internal party label</span>
                <input
                  autoComplete="off"
                  maxLength={120}
                  name="internalLabel"
                  placeholder="Santos household"
                  ref={firstFieldRef}
                  required
                />
              </label>
              <label>
                <span>Envelope greeting</span>
                <input
                  autoComplete="off"
                  maxLength={120}
                  name="recipientName"
                  placeholder="Tita Lena and family"
                  required
                />
              </label>
              <label>
                <span>Party capacity</span>
                <input
                  defaultValue="1"
                  inputMode="numeric"
                  max={50}
                  min={1}
                  name="capacity"
                  required
                  type="number"
                />
              </label>
              <label>
                <span>
                  Named guests <small>Optional, one per line</small>
                </span>
                <textarea
                  maxLength={6049}
                  name="guestNames"
                  placeholder={"Lena Santos\nPaolo Santos"}
                  rows={4}
                />
              </label>
              {actionMessage ? <p className={styles.dialogStatus}>{actionMessage}</p> : null}
              <div className={styles.dialogActions}>
                <button disabled={isPending} onClick={closeDialog} type="button">
                  Cancel
                </button>
                <button disabled={isPending} type="submit">
                  {isPending ? "Preparing..." : "Create party & link"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {confirmation ? (
        <div className={styles.backdrop}>
          <section
            aria-describedby="link-confirmation-description"
            aria-labelledby="link-confirmation-title"
            aria-modal="true"
            className={styles.dialog}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <p className={styles.eyebrow}>Private link control</p>
            <h2 id="link-confirmation-title">
              {confirmation.kind === "replace"
                ? "Replace this personalized link?"
                : "Revoke this personalized link?"}
            </h2>
            <p id="link-confirmation-description">
              {confirmation.kind === "replace"
                ? "The current link will stop working immediately. A fresh link will be shown once and must be copied before leaving."
                : "The party will lose personalized access immediately. The general invitation link will keep working."}
            </p>
            {actionMessage ? <p className={styles.dialogStatus}>{actionMessage}</p> : null}
            <div className={styles.dialogActions}>
              <button disabled={isPending} onClick={closeDialog} type="button">
                Keep current link
              </button>
              <button
                className={confirmation.kind === "revoke" ? styles.confirmDanger : undefined}
                disabled={isPending}
                onClick={() => void confirmLinkAction()}
                type="button"
              >
                {isPending
                  ? "Working..."
                  : confirmation.kind === "replace"
                    ? "Replace link"
                    : "Revoke link"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
