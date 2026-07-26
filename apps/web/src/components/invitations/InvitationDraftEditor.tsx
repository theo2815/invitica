"use client";

import type { InvitationDocument } from "@invitica/invitation-schema";
import { type InvitationOpeningState, resolveTemplateRenderer } from "@invitica/renderer";
import type { TemplateManifest } from "@invitica/template-kit";
import { useCallback, useMemo, useState } from "react";
import { z } from "zod";

import { saveGardenPromiseAction } from "../../server/invitations/actions";
import type { InvitationPublicationStatus } from "../../server/invitations/publications";
import { CalendarPicker, formatLongCalendarDate, parseCalendarDate } from "../forms/CalendarPicker";
import styles from "./InvitationDraftEditor.module.css";
import { InvitationPublicationPanel } from "./InvitationPublicationPanel";
import { type DraftSaveStatus, useDraftAutosave } from "./useDraftAutosave";

type HeroSection = Extract<InvitationDocument["sections"][number], { type: "hero" }>;
type VenueSection = Extract<InvitationDocument["sections"][number], { type: "venue" }>;
type RsvpSection = Extract<InvitationDocument["sections"][number], { type: "rsvp" }>;
type MobilePanel = "edit" | "preview";

interface GardenPromiseFields {
  dateLabel: string;
  mapUrl: string;
  rsvpDeadline: string;
  rsvpMessage: string;
  subtitle: string;
  title: string;
  venueAddress: string;
  venueName: string;
}

/** Shape guard for a recovery snapshot, which is session storage rather than state. */
const gardenPromiseFieldsSchema = z.strictObject({
  dateLabel: z.string().max(2_000),
  mapUrl: z.string().max(2_000),
  rsvpDeadline: z.string().max(2_000),
  rsvpMessage: z.string().max(2_000),
  subtitle: z.string().max(2_000),
  title: z.string().max(2_000),
  venueAddress: z.string().max(2_000),
  venueName: z.string().max(2_000),
});

interface InvitationDraftEditorProps {
  initialDocument: InvitationDocument;
  initialPublication?: InvitationPublicationStatus;
  initialRevision: number;
  invitationId: string;
  rendererKey: TemplateManifest["rendererKey"];
}

const idlePublication: InvitationPublicationStatus = {
  errorCode: null,
  livePublicIdentifier: null,
  publicationId: null,
  publishedRevision: null,
  status: "idle",
};

function findHero(document: InvitationDocument): HeroSection {
  const hero = document.sections.find((section): section is HeroSection => section.type === "hero");

  if (!hero) {
    throw new Error("The invitation document has no editable hero section.");
  }

  return hero;
}

function findVenue(document: InvitationDocument): VenueSection {
  const venue = document.sections.find(
    (section): section is VenueSection => section.type === "venue",
  );
  if (!venue) throw new Error("The invitation document has no editable venue section.");
  return venue;
}

function findRsvp(document: InvitationDocument): RsvpSection {
  const rsvp = document.sections.find((section): section is RsvpSection => section.type === "rsvp");
  if (!rsvp) throw new Error("The invitation document has no editable RSVP section.");
  return rsvp;
}

function deadlineDate(deadline: string | undefined): string {
  return deadline?.slice(0, 10) ?? "";
}

function normalizeFields(fields: GardenPromiseFields): GardenPromiseFields {
  return {
    dateLabel: fields.dateLabel.trim(),
    mapUrl: fields.mapUrl.trim(),
    rsvpDeadline: fields.rsvpDeadline,
    rsvpMessage: fields.rsvpMessage.trim(),
    subtitle: fields.subtitle.trim(),
    title: fields.title.trim(),
    venueAddress: fields.venueAddress.trim(),
    venueName: fields.venueName.trim(),
  };
}

function mapUrlIsValid(value: string): boolean {
  if (!value) return true;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function dateOnlyIsValid(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function applyGardenPromiseFields(
  document: InvitationDocument,
  fields: GardenPromiseFields,
): InvitationDocument {
  let heroUpdated = false;
  let venueUpdated = false;
  let rsvpUpdated = false;
  const sections = document.sections.map((section) => {
    if (!heroUpdated && section.type === "hero") {
      heroUpdated = true;
      const props = { ...section.props, title: fields.title };
      if (fields.subtitle) props.subtitle = fields.subtitle;
      else delete props.subtitle;
      if (fields.dateLabel) props.dateLabel = fields.dateLabel;
      else delete props.dateLabel;
      return { ...section, props };
    }

    if (!venueUpdated && section.type === "venue") {
      venueUpdated = true;
      const props = {
        ...section.props,
        address: fields.venueAddress,
        venueName: fields.venueName,
      };
      if (fields.mapUrl) props.mapUrl = fields.mapUrl;
      else delete props.mapUrl;
      return { ...section, props };
    }

    if (!rsvpUpdated && section.type === "rsvp") {
      rsvpUpdated = true;
      const props = { ...section.props };
      if (fields.rsvpMessage) props.message = fields.rsvpMessage;
      else delete props.message;
      if (fields.rsvpDeadline) props.deadline = `${fields.rsvpDeadline}T23:59:59+08:00`;
      else delete props.deadline;
      return { ...section, props };
    }

    return section;
  });

  if (!heroUpdated || !venueUpdated || !rsvpUpdated) return document;
  return { ...document, sections };
}

const saveStatusLabel: Record<DraftSaveStatus, string> = {
  conflict: "Save conflict",
  error: "Save failed",
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved changes",
};

export function InvitationDraftEditor({
  initialDocument,
  initialPublication = idlePublication,
  initialRevision,
  invitationId,
  rendererKey,
}: InvitationDraftEditorProps) {
  const initialHero = findHero(initialDocument);
  const initialVenue = findVenue(initialDocument);
  const initialRsvp = findRsvp(initialDocument);
  const [fields, setFields] = useState<GardenPromiseFields>({
    dateLabel: initialHero.props.dateLabel ?? "",
    mapUrl: initialVenue.props.mapUrl ?? "",
    rsvpDeadline: deadlineDate(initialRsvp.props.deadline),
    rsvpMessage: initialRsvp.props.message ?? "",
    subtitle: initialHero.props.subtitle ?? "",
    title: initialHero.props.title,
    venueAddress: initialVenue.props.address,
    venueName: initialVenue.props.venueName,
  });
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("edit");
  const [previewOpeningState, setPreviewOpeningState] = useState<InvitationOpeningState>("closed");
  const [previewReplayKey, setPreviewReplayKey] = useState(0);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const normalizedFields = useMemo(() => normalizeFields(fields), [fields]);
  const signature = JSON.stringify(normalizedFields);

  const document = useMemo(
    () => applyGardenPromiseFields(initialDocument, fields),
    [fields, initialDocument],
  );
  const Renderer = resolveTemplateRenderer(rendererKey);
  const titleIsValid = normalizedFields.title.length > 0;
  const venueNameIsValid = normalizedFields.venueName.length > 0;
  const venueAddressIsValid = normalizedFields.venueAddress.length > 0;
  const mapUrlIsSafe = mapUrlIsValid(normalizedFields.mapUrl);
  const rsvpDeadlineIsValid = dateOnlyIsValid(normalizedFields.rsvpDeadline);
  const fieldsAreValid =
    titleIsValid && venueNameIsValid && venueAddressIsValid && mapUrlIsSafe && rsvpDeadlineIsValid;
  const assetsAreReady = document.assets.length === 0;

  const save = useCallback(
    ({ expectedRevision, payload }: { expectedRevision: number; payload: GardenPromiseFields }) =>
      saveGardenPromiseAction({ ...payload, expectedRevision, invitationId }),
    [invitationId],
  );

  const autosave = useDraftAutosave<GardenPromiseFields>({
    initialRevision,
    invitationId,
    payload: fieldsAreValid ? normalizedFields : null,
    save,
    signature,
  });
  const {
    message: saveMessage,
    recoveredContent,
    revision,
    retryAttempt,
    saveNow,
    status: saveStatus,
  } = autosave;
  const draftIsSaved = autosave.isSaved;

  function updateField(field: keyof GardenPromiseFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setRecoveryMessage(null);
    autosave.markEdited();
  }

  /**
   * Reapplies fields recovered from an interrupted session. The snapshot is the same
   * serialized payload the editor submits, so it is re-validated before it is trusted.
   */
  function restoreRecoveredContent() {
    if (!recoveredContent) return;
    try {
      const recovered = gardenPromiseFieldsSchema.parse(JSON.parse(recoveredContent));
      setFields(recovered);
      autosave.discardRecoveredSnapshot();
      autosave.markEdited();
      setRecoveryMessage("Your recovered changes are back. They will save automatically.");
    } catch {
      autosave.discardRecoveredSnapshot();
      setRecoveryMessage("Those recovered changes could not be read, so they were discarded.");
    }
  }

  function reloadLatest() {
    window.location.reload();
  }

  async function copyUnsavedDetails() {
    const copy = [
      `Invitation title: ${fields.title}`,
      `Invitation message: ${fields.subtitle}`,
      `Display date: ${fields.dateLabel}`,
      `Venue: ${fields.venueName}`,
      `Address: ${fields.venueAddress}`,
      `Map link: ${fields.mapUrl}`,
      `RSVP message: ${fields.rsvpMessage}`,
      `RSVP deadline: ${fields.rsvpDeadline}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(copy);
      setRecoveryMessage("Unsaved details copied. You can now reload and compare versions safely.");
    } catch {
      setRecoveryMessage("Copy was unavailable. Copy the visible fields before discarding them.");
    }
  }

  const statusDescription =
    saveStatus === "saved"
      ? `Revision ${revision}`
      : saveStatus === "saving"
        ? retryAttempt > 0
          ? `Trying again — attempt ${retryAttempt + 1}`
          : "Keeping this draft up to date"
        : saveStatus === "conflict"
          ? "Preserve or discard your local changes"
          : saveStatus === "error"
            ? "Not saved yet"
            : "Not yet saved";

  return (
    <section aria-labelledby="draft-editor-heading" className={styles.editor}>
      <div className={styles.editorHeading}>
        <div>
          <p className={styles.eyebrow}>Invitation editor</p>
          <h2 id="draft-editor-heading">Make the opening unmistakably yours.</h2>
        </div>

        <div aria-live="polite" className={styles.saveStatus} data-status={saveStatus}>
          <span aria-hidden="true" />
          <div>
            <strong>{saveStatusLabel[saveStatus]}</strong>
            <small>{statusDescription}</small>
          </div>
        </div>
      </div>

      <fieldset className={styles.mobileSwitcher}>
        <legend className={styles.visuallyHidden}>Editor view</legend>
        <button
          aria-pressed={mobilePanel === "edit"}
          onClick={() => setMobilePanel("edit")}
          type="button"
        >
          Edit details
        </button>
        <button
          aria-pressed={mobilePanel === "preview"}
          onClick={() => setMobilePanel("preview")}
          type="button"
        >
          Preview invitation
        </button>
      </fieldset>

      <div className={styles.editorGrid} data-mobile-panel={mobilePanel}>
        <aside className={styles.inspector}>
          <div className={styles.inspectorHeading}>
            <p className={styles.eyebrow}>Event details</p>
            <h3>The details guests need</h3>
            <p>Opening, venue, and RSVP changes update the Garden Promise preview beside you.</p>
          </div>

          <div className={styles.fieldSection}>
            <h4>Opening</h4>
            <div className={styles.fieldGroup}>
              <label htmlFor="hero-title">
                Names or invitation title
                <span>Required · 120 characters</span>
              </label>
              <input
                aria-describedby={!titleIsValid ? "hero-title-error" : undefined}
                aria-invalid={!titleIsValid}
                id="hero-title"
                maxLength={120}
                onChange={(event) => updateField("title", event.target.value)}
                value={fields.title}
              />
              {!titleIsValid ? (
                <small className={styles.fieldError} id="hero-title-error" role="alert">
                  Add the names or title before this draft can save.
                </small>
              ) : null}
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="hero-subtitle">
                Invitation message
                <span>Optional · 240 characters</span>
              </label>
              <textarea
                id="hero-subtitle"
                maxLength={240}
                onChange={(event) => updateField("subtitle", event.target.value)}
                rows={4}
                value={fields.subtitle}
              />
            </div>

            <CalendarPicker
              className={styles.fieldGroup}
              displayFormat="long"
              hint="Optional"
              id="hero-date"
              label="Display date"
              onChange={(nextDate) =>
                updateField("dateLabel", nextDate ? formatLongCalendarDate(nextDate) : "")
              }
              value={parseCalendarDate(fields.dateLabel) ?? ""}
            />
          </div>

          <div className={styles.fieldSection}>
            <h4>Venue</h4>
            <div className={styles.fieldGroup}>
              <label htmlFor="venue-name">
                Venue name
                <span>Required · 120 characters</span>
              </label>
              <input
                aria-describedby={!venueNameIsValid ? "venue-name-error" : undefined}
                aria-invalid={!venueNameIsValid}
                id="venue-name"
                maxLength={120}
                onChange={(event) => updateField("venueName", event.target.value)}
                value={fields.venueName}
              />
              {!venueNameIsValid ? (
                <small className={styles.fieldError} id="venue-name-error" role="alert">
                  Add the venue name before this draft can save.
                </small>
              ) : null}
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="venue-address">
                Venue address
                <span>Required · 500 characters</span>
              </label>
              <textarea
                aria-describedby={!venueAddressIsValid ? "venue-address-error" : undefined}
                aria-invalid={!venueAddressIsValid}
                id="venue-address"
                maxLength={500}
                onChange={(event) => updateField("venueAddress", event.target.value)}
                rows={3}
                value={fields.venueAddress}
              />
              {!venueAddressIsValid ? (
                <small className={styles.fieldError} id="venue-address-error" role="alert">
                  Add the venue address before this draft can save.
                </small>
              ) : null}
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="venue-map-url">
                Map link
                <span>Optional · HTTPS recommended</span>
              </label>
              <input
                aria-describedby={!mapUrlIsSafe ? "venue-map-url-error" : undefined}
                aria-invalid={!mapUrlIsSafe}
                id="venue-map-url"
                inputMode="url"
                maxLength={2048}
                onChange={(event) => updateField("mapUrl", event.target.value)}
                placeholder="https://maps.google.com/…"
                type="url"
                value={fields.mapUrl}
              />
              {!mapUrlIsSafe ? (
                <small className={styles.fieldError} id="venue-map-url-error" role="alert">
                  Use a complete http:// or https:// link.
                </small>
              ) : null}
            </div>
          </div>

          <div className={styles.fieldSection}>
            <h4>RSVP</h4>
            <div className={styles.fieldGroup}>
              <label htmlFor="rsvp-message">
                RSVP message
                <span>Optional · 500 characters</span>
              </label>
              <textarea
                id="rsvp-message"
                maxLength={500}
                onChange={(event) => updateField("rsvpMessage", event.target.value)}
                rows={3}
                value={fields.rsvpMessage}
              />
            </div>

            <div className={styles.fieldGroup}>
              <CalendarPicker
                ariaDescribedBy={
                  !rsvpDeadlineIsValid ? "rsvp-deadline-error" : "rsvp-deadline-hint"
                }
                hint="Optional"
                id="rsvp-deadline"
                invalid={!rsvpDeadlineIsValid}
                label="RSVP deadline"
                onChange={(nextDate) => updateField("rsvpDeadline", nextDate)}
                value={fields.rsvpDeadline}
              />
              {!rsvpDeadlineIsValid ? (
                <small className={styles.fieldError} id="rsvp-deadline-error" role="alert">
                  Choose a valid calendar date.
                </small>
              ) : null}
              <small className={styles.fieldHint} id="rsvp-deadline-hint">
                End of the selected day in Philippine time.
              </small>
            </div>
          </div>

          {recoveredContent ? (
            <div className={styles.saveNotice} data-kind="conflict" role="alert">
              <div>
                <strong>Unsaved changes were found from an interrupted session.</strong>
                <p>
                  They were edited against this same revision and never reached the server. Bring
                  them back, or discard them to keep what is on screen now.
                </p>
              </div>
              <div className={styles.saveNoticeActions}>
                <button onClick={() => restoreRecoveredContent()} type="button">
                  Restore my changes
                </button>
                <button onClick={() => autosave.discardRecoveredSnapshot()} type="button">
                  Discard them
                </button>
              </div>
            </div>
          ) : null}

          {saveStatus === "error" && saveMessage ? (
            <div className={styles.saveNotice} data-kind="error" role="alert">
              <div>
                <strong>We could not save these changes.</strong>
                <p>{saveMessage}</p>
              </div>
              <div className={styles.saveNoticeActions}>
                <button disabled={!fieldsAreValid} onClick={() => saveNow()} type="button">
                  Try again
                </button>
                <button onClick={() => void copyUnsavedDetails()} type="button">
                  Copy unsaved details
                </button>
              </div>
              {recoveryMessage ? <p role="status">{recoveryMessage}</p> : null}
            </div>
          ) : null}

          {saveStatus === "conflict" && saveMessage ? (
            <div className={styles.saveNotice} data-kind="conflict" role="alert">
              <div>
                <strong>A newer version is already saved.</strong>
                <p>{saveMessage} Your local text remains visible here until you reload.</p>
              </div>
              <div className={styles.saveNoticeActions}>
                <button onClick={() => void copyUnsavedDetails()} type="button">
                  Copy unsaved details
                </button>
                <button onClick={reloadLatest} type="button">
                  Discard and reload
                </button>
              </div>
              {recoveryMessage ? <p role="status">{recoveryMessage}</p> : null}
            </div>
          ) : null}

          {saveStatus === "unsaved" ? (
            <button
              className={styles.saveNowButton}
              disabled={!autosave.canSaveNow}
              onClick={() => saveNow()}
              type="button"
            >
              Save now
            </button>
          ) : null}

          <InvitationPublicationPanel
            assetsReady={assetsAreReady}
            canPublish={draftIsSaved && fieldsAreValid && assetsAreReady}
            detailsReady={fieldsAreValid}
            draftReady={draftIsSaved}
            initialPublication={initialPublication}
            invitationId={invitationId}
            key={invitationId}
            revision={revision}
            titleReady={titleIsValid}
          />

          <p className={styles.autosaveNote}>
            Autosave begins after a short pause. Theme, section ordering, visibility, and media
            editing remain intentionally unavailable in this minimum Garden Promise slice.
          </p>
        </aside>

        <div className={styles.previewPanel}>
          <div className={styles.previewHeading}>
            <div>
              <p className={styles.eyebrow}>Live invitation preview</p>
              <h3>Garden Promise</h3>
            </div>
            <div className={styles.previewMeta}>
              <span>Shared renderer · Responsive document</span>
              <button
                disabled={previewOpeningState !== "opened"}
                onClick={() => {
                  setPreviewOpeningState("closed");
                  setPreviewReplayKey((current) => current + 1);
                }}
                type="button"
              >
                Replay opening
              </button>
            </div>
          </div>

          <div className={styles.previewFrame}>
            <Renderer
              document={document}
              mode="preview"
              onOpeningStateChange={setPreviewOpeningState}
              openingReplayKey={previewReplayKey}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
