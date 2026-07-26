"use client";

import type { InvitationDocument, InvitationSection } from "@invitica/invitation-schema";
import { type InvitationOpeningState, resolveTemplateRenderer } from "@invitica/renderer";
import type { TemplateManifest } from "@invitica/template-kit";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  applyLittleBlessingsDetails,
  littleBlessingsDetailsSchema,
} from "../../lib/invitations/little-blessings-details";
import { getMapTileKey } from "../../lib/map-tile-key";
import { saveLittleBlessingsAction } from "../../server/invitations/actions";
import type { InvitationPublicationStatus } from "../../server/invitations/publications";
import { listInvitationImagesAction } from "../../server/media/actions";
import type { CreatorImageAsset } from "../../server/media/library";
import { InvitationPublicationPanel } from "./InvitationPublicationPanel";
import styles from "./LittleBlessingsDraftEditor.module.css";
import {
  AddItemButton,
  CollectionItem,
  ColorField,
  DateField,
  DateTimeField,
  LastItemNotice,
  SectionCard,
  TextField,
} from "./LittleBlessingsEditorFields";
import { LittleBlessingsImageField } from "./LittleBlessingsImageField";
import { type DraftSaveStatus, useDraftAutosave } from "./useDraftAutosave";
import { VenueLocationPicker } from "./VenueLocationPicker";

const MAX_PHOTOS = 8;
const MAX_GIFTS = 8;

type SectionKey =
  | "attire"
  | "countdown"
  | "event-details"
  | "gallery"
  | "gifts"
  | "guidance"
  | "hero"
  | "message"
  | "participants"
  | "rsvp"
  | "schedule";

/**
 * The curated Little Blessings order. Creators choose what to show, never where
 * it sits: the reply section is last so an invited guest reads the whole
 * invitation before being asked to decide.
 */
const SECTION_ORDER: readonly SectionKey[] = [
  "hero",
  "message",
  "countdown",
  "event-details",
  "participants",
  "schedule",
  "attire",
  "gallery",
  "guidance",
  "gifts",
  "rsvp",
];

const SECTION_NAMES: Record<SectionKey, string> = {
  attire: "What to wear",
  countdown: "Until the celebration",
  "event-details": "Where and when",
  gallery: "Little moments",
  gifts: "Gift ideas",
  guidance: "A gentle note",
  hero: "The celebrant",
  message: "Held in grace",
  participants: "Ninong and ninang",
  rsvp: "Celebrate with us",
  schedule: "Order of the day",
};

const LOCKED_SECTIONS: Partial<Record<SectionKey, string>> = {
  "event-details":
    "Guests always need the date, time, and place, so this section cannot be hidden.",
  hero: "This carries the celebrant's name, date, and portrait, and is what the closed envelope shows, so it cannot be hidden.",
};

/**
 * A new invitation starts with an empty, hidden album, because the template's
 * showcase photographs are the catalog's and not the creator's. An album with
 * nothing in it has nothing to show, so the switch waits for the first
 * photograph rather than offering a state the invitation contract rejects.
 */
const EMPTY_GALLERY_REASON = "Add a photograph and this album can be shown to your guests.";

const SECTION_NOTES: Partial<Record<SectionKey, string>> = {
  message:
    "The parents' names live in this section. Hiding it also hides who is signing the invitation.",
  rsvp: "Only guests who open their own personal link ever see this. Guests using the general link never see a reply section.",
};

type MobilePanel = "edit" | "preview";
type PreviewAudience = "general" | "personalized";

interface ColorState {
  label: string;
  value: string;
}

interface EventState {
  address: string;
  arrivalNote: string;
  date: string;
  dateLabel: string;
  label: string;
  latitude: string;
  longitude: string;
  mapUrl: string;
  time: string;
  venueName: string;
}

/**
 * Editable mirror of the document's Little Blessings sections. Text is held as
 * raw strings — including the empty string a creator leaves behind when they
 * clear an optional field — and converted to the strict contract on the way out.
 */
interface EditorState {
  attire: {
    colors: ColorState[];
    description: string;
    groups: { colors: ColorState[]; description: string; label: string }[];
    heading: string;
  };
  countdown: { date: string; dateLabel: string; heading: string; time: string };
  eventDetails: { events: EventState[]; heading: string };
  gallery: {
    description: string;
    heading: string;
    images: { assetId: string; caption: string; title: string }[];
  };
  gifts: {
    heading: string;
    items: { imageAssetId: string | null; name: string; note: string }[];
    message: string;
  };
  guidance: { heading: string; items: string[] };
  hero: {
    dateLabel: string;
    eyebrow: string;
    imageAssetId: string | null;
    subtitle: string;
    title: string;
  };
  message: { body: string; heading: string; signatureLead: string; signatureNames: string[] };
  participants: { groups: { label: string; names: string[] }[]; heading: string };
  rsvp: { deadline: string; heading: string; message: string };
  schedule: { heading: string; items: { description: string; timeLabel: string; title: string }[] };
  visible: Record<SectionKey, boolean>;
}

interface LittleBlessingsDraftEditorProps {
  initialAssets: readonly CreatorImageAsset[];
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

function findSection<Type extends InvitationSection["type"]>(
  document: InvitationDocument,
  type: Type,
): Extract<InvitationSection, { type: Type }> | undefined {
  return document.sections.find(
    (section): section is Extract<InvitationSection, { type: Type }> => section.type === type,
  );
}

function splitDateTime(value: string | undefined) {
  return { date: value?.slice(0, 10) ?? "", time: value?.slice(11, 16) ?? "" };
}

/** The invitation's event timezone is Asia/Manila, so the offset is not a creator concern. */
function joinDateTime(date: string, time: string): string {
  return date ? `${date}T${time || "00:00"}:00+08:00` : "";
}

function blank(value: string): boolean {
  return value.trim().length === 0;
}

function moveItem<Item>(items: readonly Item[], index: number, direction: -1 | 1): Item[] {
  const target = index + direction;
  const moved = items[index];
  const displaced = items[target];
  if (moved === undefined || displaced === undefined) return [...items];

  return items.map((item, position) =>
    position === index ? displaced : position === target ? moved : item,
  );
}

function removeAt<Item>(items: readonly Item[], index: number): Item[] {
  return items.filter((_, position) => position !== index);
}

function replaceAt<Item>(items: readonly Item[], index: number, value: Item): Item[] {
  return items.map((item, position) => (position === index ? value : item));
}

function buildInitialState(document: InvitationDocument): EditorState {
  const hero = findSection(document, "hero");
  const message = findSection(document, "message");
  const countdown = findSection(document, "countdown");
  const eventDetails = findSection(document, "event-details");
  const participants = findSection(document, "participants");
  const schedule = findSection(document, "schedule");
  const attire = findSection(document, "attire");
  const gallery = findSection(document, "gallery");
  const guidance = findSection(document, "guidance");
  const gifts = findSection(document, "gifts");
  const rsvp = findSection(document, "rsvp");
  const countdownAt = splitDateTime(countdown?.props.target);

  const visible = {} as Record<SectionKey, boolean>;
  for (const key of SECTION_ORDER) {
    visible[key] = document.sections.find((section) => section.type === key)?.visible ?? false;
  }

  return {
    attire: {
      colors: (attire?.props.colors ?? []).map((color) => ({ ...color })),
      description: attire?.props.description ?? "",
      groups: (attire?.props.groups ?? []).map((group) => ({
        colors: (group.colors ?? []).map((color) => ({ ...color })),
        description: group.description,
        label: group.label,
      })),
      heading: attire?.props.heading ?? "",
    },
    countdown: {
      date: countdownAt.date,
      dateLabel: countdown?.props.dateLabel ?? "",
      heading: countdown?.props.heading ?? "",
      time: countdownAt.time,
    },
    eventDetails: {
      events: (eventDetails?.props.events ?? []).map((event) => {
        const startsAt = splitDateTime(event.startAt);
        return {
          address: event.address,
          arrivalNote: event.arrivalNote ?? "",
          date: startsAt.date,
          dateLabel: event.dateLabel,
          label: event.label,
          latitude: event.latitude === undefined ? "" : String(event.latitude),
          longitude: event.longitude === undefined ? "" : String(event.longitude),
          mapUrl: event.mapUrl ?? "",
          time: startsAt.time,
          venueName: event.venueName,
        };
      }),
      heading: eventDetails?.props.heading ?? "",
    },
    gallery: {
      description: gallery?.props.description ?? "",
      heading: gallery?.props.heading ?? "",
      images: (gallery?.props.images ?? []).map((image) => ({
        assetId: image.assetId,
        caption: image.caption ?? "",
        title: image.title ?? "",
      })),
    },
    gifts: {
      heading: gifts?.props.heading ?? "",
      items: (gifts?.props.items ?? []).map((item) => ({
        imageAssetId: item.imageAssetId ?? null,
        name: item.name,
        note: item.note ?? "",
      })),
      message: gifts?.props.message ?? "",
    },
    guidance: { heading: guidance?.props.heading ?? "", items: [...(guidance?.props.items ?? [])] },
    hero: {
      dateLabel: hero?.props.dateLabel ?? "",
      eyebrow: hero?.props.eyebrow ?? "",
      imageAssetId: hero?.props.imageAssetId ?? null,
      subtitle: hero?.props.subtitle ?? "",
      title: hero?.props.title ?? "",
    },
    message: {
      body: message?.props.body ?? "",
      heading: message?.props.heading ?? "",
      signatureLead: message?.props.signature?.lead ?? "",
      signatureNames: [...(message?.props.signature?.names ?? [])],
    },
    participants: {
      groups: (participants?.props.groups ?? []).map((group) => ({
        label: group.label,
        names: [...group.names],
      })),
      heading: participants?.props.heading ?? "",
    },
    rsvp: {
      deadline: rsvp?.props.deadline?.slice(0, 10) ?? "",
      heading: rsvp?.props.heading ?? "",
      message: rsvp?.props.message ?? "",
    },
    schedule: {
      heading: schedule?.props.heading ?? "",
      items: (schedule?.props.items ?? []).map((item) => ({
        description: item.description ?? "",
        timeLabel: item.timeLabel,
        title: item.title,
      })),
    },
    visible,
  };
}

function numberOrUndefined(value: string): number | undefined {
  if (blank(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Converts editor state into the section payload. Blank optional text stays in
 * — the details schema treats a cleared field as absent — so nothing here has to
 * decide twice what "empty" means.
 */
function toDetails(document: InvitationDocument, state: EditorState): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  const present = new Set<string>(document.sections.map((section) => section.type));
  const signatureNames = state.message.signatureNames.filter((name) => !blank(name));

  const add = (key: SectionKey, props: Record<string, unknown>) => {
    if (present.has(key)) details[key] = { props, visible: state.visible[key] };
  };

  add("hero", {
    dateLabel: state.hero.dateLabel,
    eyebrow: state.hero.eyebrow,
    imageAssetId: state.hero.imageAssetId ?? "",
    subtitle: state.hero.subtitle,
    title: state.hero.title,
  });
  add("message", {
    body: state.message.body,
    heading: state.message.heading,
    ...(signatureNames.length > 0
      ? { signature: { lead: state.message.signatureLead, names: signatureNames } }
      : {}),
  });
  add("countdown", {
    dateLabel: state.countdown.dateLabel,
    heading: state.countdown.heading,
    target: joinDateTime(state.countdown.date, state.countdown.time),
  });
  add("event-details", {
    events: state.eventDetails.events.map((event) => {
      // The renderer shows a map only when both coordinates are present, so a lone one
      // is silently inert. Dropping the pair together keeps the document honest about
      // whether a location was actually set.
      const latitude = numberOrUndefined(event.latitude);
      const longitude = numberOrUndefined(event.longitude);
      const located = latitude !== undefined && longitude !== undefined;
      return {
        address: event.address,
        arrivalNote: event.arrivalNote,
        dateLabel: event.dateLabel,
        label: event.label,
        latitude: located ? latitude : undefined,
        longitude: located ? longitude : undefined,
        mapUrl: event.mapUrl,
        startAt: joinDateTime(event.date, event.time),
        venueName: event.venueName,
      };
    }),
    heading: state.eventDetails.heading,
  });
  add("participants", {
    // Names are typed one per line, so a blank line is a creator pressing Enter,
    // not an empty name they meant to keep.
    groups: state.participants.groups.map((group) => ({
      label: group.label,
      names: group.names.map((name) => name.trim()).filter((name) => name.length > 0),
    })),
    heading: state.participants.heading,
  });
  add("schedule", {
    heading: state.schedule.heading,
    items: state.schedule.items.map((item) => ({
      description: item.description,
      timeLabel: item.timeLabel,
      title: item.title,
    })),
  });
  add("attire", {
    ...(state.attire.colors.length > 0 ? { colors: state.attire.colors } : {}),
    description: state.attire.description,
    ...(state.attire.groups.length > 0
      ? {
          groups: state.attire.groups.map((group) => ({
            ...(group.colors.length > 0 ? { colors: group.colors } : {}),
            description: group.description,
            label: group.label,
          })),
        }
      : {}),
    heading: state.attire.heading,
  });
  add("gallery", {
    description: state.gallery.description,
    heading: state.gallery.heading,
    images: state.gallery.images.map((image) => ({
      assetId: image.assetId,
      caption: image.caption,
      title: image.title,
    })),
  });
  add("guidance", { heading: state.guidance.heading, items: state.guidance.items });
  add("gifts", {
    heading: state.gifts.heading,
    items: state.gifts.items.map((item) => ({
      imageAssetId: item.imageAssetId ?? "",
      name: item.name,
      note: item.note,
    })),
    message: state.gifts.message,
  });
  add("rsvp", {
    deadline: state.rsvp.deadline ? `${state.rsvp.deadline}T23:59:59+08:00` : "",
    heading: state.rsvp.heading,
    message: state.rsvp.message,
  });

  return details;
}

const saveStatusLabel: Record<DraftSaveStatus, string> = {
  conflict: "Save conflict",
  error: "Save failed",
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved changes",
};

export function LittleBlessingsDraftEditor({
  initialAssets,
  initialDocument,
  initialPublication = idlePublication,
  initialRevision,
  invitationId,
  rendererKey,
}: LittleBlessingsDraftEditorProps) {
  const Renderer = resolveTemplateRenderer(rendererKey);
  const mapTileKey = getMapTileKey();
  const [assets, setAssets] = useState<readonly CreatorImageAsset[]>(initialAssets);
  const [lastItemPrompt, setLastItemPrompt] = useState<SectionKey | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("edit");
  const [openSection, setOpenSection] = useState<SectionKey | null>("hero");
  const [previewAudience, setPreviewAudience] = useState<PreviewAudience>("personalized");
  const [previewOpeningState, setPreviewOpeningState] = useState<InvitationOpeningState>("closed");
  const [previewReplayKey, setPreviewReplayKey] = useState(0);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [state, setState] = useState<EditorState>(() => buildInitialState(initialDocument));

  const details = useMemo(() => toDetails(initialDocument, state), [initialDocument, state]);
  const parsed = useMemo(() => littleBlessingsDetailsSchema.safeParse(details), [details]);
  const signature = useMemo(() => JSON.stringify(details), [details]);

  const save = useCallback(
    ({ expectedRevision, payload }: { expectedRevision: number; payload: unknown }) =>
      saveLittleBlessingsAction({ details: payload, expectedRevision, invitationId }),
    [invitationId],
  );

  const autosave = useDraftAutosave<unknown>({
    initialRevision,
    invitationId,
    payload: parsed.success ? parsed.data : null,
    save,
    signature,
  });
  const {
    message: saveMessage,
    recoveredContent,
    revision,
    retryAttempt,
    status: saveStatus,
  } = autosave;

  // The invitation the creator is looking at. A momentarily incomplete field
  // must not blank the preview, so the last document that satisfied the strict
  // contract stays on screen while the inline field errors explain the gap.
  const lastValidDocument = useRef(initialDocument);
  const previewDocument = useMemo(() => {
    if (parsed.success) {
      try {
        lastValidDocument.current = applyLittleBlessingsDetails(initialDocument, parsed.data);
      } catch {
        // Keep the last document that parsed.
      }
    }
    return lastValidDocument.current;
  }, [initialDocument, parsed]);

  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const resolveImage = useCallback(
    (assetId: string) => {
      const asset = assetsById.get(assetId);
      return asset
        ? { height: asset.height, renditions: asset.renditions, width: asset.width }
        : null;
    },
    [assetsById],
  );

  const refreshAssets = useCallback(async () => {
    const result = await listInvitationImagesAction({ invitationId });
    if (result.status === "loaded") setAssets(result.assets);
  }, [invitationId]);

  const fieldsAreValid = parsed.success;
  const draftIsSaved = autosave.isSaved;
  const referencedImageIds = previewDocument.assets
    .filter((asset) => asset.kind === "image")
    .map((asset) => asset.id);
  const assetsAreReady = referencedImageIds.every((id) => assetsById.has(id));

  const markEdited = autosave.markEdited;
  const edit = useCallback(
    (next: (current: EditorState) => EditorState) => {
      setState(next);
      setRecoveryMessage(null);
      setLastItemPrompt(null);
      markEdited();
    },
    [markEdited],
  );

  const saveNow = autosave.saveNow;

  async function copyUnsavedDetails() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(details, null, 2));
      setRecoveryMessage("Unsaved details copied. You can now reload and compare versions safely.");
    } catch {
      setRecoveryMessage("Copy was unavailable. Copy the visible fields before discarding them.");
    }
  }

  function setVisible(key: SectionKey, visible: boolean) {
    edit((current) => ({ ...current, visible: { ...current.visible, [key]: visible } }));
  }

  /**
   * Every Little Blessings collection is `min(1)` in the strict contract, so
   * deleting the last entry would produce a document the schema rejects.
   * Offering to hide the section keeps the creator's writing and uploads.
   */
  function promptOrRemove(key: SectionKey, length: number, remove: () => void) {
    if (length <= 1) {
      setLastItemPrompt(key);
      return;
    }
    remove();
  }

  const statusDescription =
    saveStatus === "saved"
      ? `Revision ${revision}`
      : saveStatus === "saving"
        ? retryAttempt > 0
          ? `Trying again — attempt ${retryAttempt + 1}`
          : "Keeping this invitation up to date"
        : saveStatus === "conflict"
          ? "Preserve or discard your local changes"
          : saveStatus === "error"
            ? "Not saved yet"
            : "Not yet saved";

  /**
   * Reapplies content recovered from an interrupted session. The snapshot is the same
   * serialized details the editor submits, so it is re-validated and routed back
   * through the document the editor builds its state from rather than trusted as state.
   */
  function restoreRecoveredContent() {
    if (!recoveredContent) return;
    try {
      const recovered = littleBlessingsDetailsSchema.parse(JSON.parse(recoveredContent));
      setState(buildInitialState(applyLittleBlessingsDetails(initialDocument, recovered)));
      autosave.discardRecoveredSnapshot();
      markEdited();
      setRecoveryMessage("Your recovered changes are back. They will save automatically.");
    } catch {
      autosave.discardRecoveredSnapshot();
      setRecoveryMessage("Those recovered changes could not be read, so they were discarded.");
    }
  }

  // A general-link guest never receives the reply section. Previewing that is a
  // document question, not a renderer one: the section is simply not shown.
  const previewedDocument =
    previewAudience === "general"
      ? {
          ...previewDocument,
          sections: previewDocument.sections.map((section) =>
            section.type === "rsvp" ? { ...section, visible: false } : section,
          ),
        }
      : previewDocument;

  return (
    <section aria-labelledby="blessings-editor-heading" className={styles.editor}>
      <div className={styles.editorHeading}>
        <div>
          <p className={styles.eyebrow}>Little Blessings editor</p>
          <h2 id="blessings-editor-heading">Tell the story of her day.</h2>
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
          Edit sections
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
            <p className={styles.eyebrow}>Invitation sections</p>
            <h3>Everything guests will read</h3>
            <p>
              Open a section to edit it, and use its switch to show or hide it. The order is part of
              the design and stays the same for every guest.
            </p>
          </div>

          <div className={styles.sectionList}>
            {SECTION_ORDER.map((key, position) => {
              const open = openSection === key;
              const emptyGallery = key === "gallery" && state.gallery.images.length === 0;
              const lockedReason =
                LOCKED_SECTIONS[key] ?? (emptyGallery ? EMPTY_GALLERY_REASON : undefined);
              const note = SECTION_NOTES[key];
              const cardProps = {
                index: position + 1,
                name: SECTION_NAMES[key],
                onToggleOpen: () => setOpenSection(open ? null : key),
                onToggleVisible: (visible: boolean) => setVisible(key, visible),
                open,
                visible: state.visible[key],
                ...(lockedReason
                  ? {
                      locked: true,
                      note: lockedReason,
                      ...(emptyGallery ? { lockedLabel: "Needs a photograph" } : {}),
                    }
                  : note
                    ? { note }
                    : {}),
              };

              if (key === "hero") {
                return (
                  <SectionCard key={key} {...cardProps}>
                    <TextField
                      id="lb-hero-eyebrow"
                      label="Above the name"
                      maxLength={80}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          hero: { ...current.hero, eyebrow: value },
                        }))
                      }
                      requirement="Optional · 80 characters"
                      value={state.hero.eyebrow}
                    />
                    <TextField
                      id="lb-hero-title"
                      invalid={blank(state.hero.title)}
                      label="The celebrant's name"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({ ...current, hero: { ...current.hero, title: value } }))
                      }
                      requirement="Required · 120 characters"
                      value={state.hero.title}
                    />
                    <TextField
                      id="lb-hero-subtitle"
                      label="A line of welcome"
                      maxLength={240}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          hero: { ...current.hero, subtitle: value },
                        }))
                      }
                      requirement="Optional · 240 characters"
                      rows={3}
                      value={state.hero.subtitle}
                    />
                    <DateField
                      id="lb-hero-date"
                      label="Written date"
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          hero: { ...current.hero, dateLabel: value },
                        }))
                      }
                      value={state.hero.dateLabel}
                    />
                    <LittleBlessingsImageField
                      asset={
                        state.hero.imageAssetId
                          ? assetsById.get(state.hero.imageAssetId)
                          : undefined
                      }
                      assetId={state.hero.imageAssetId}
                      imageRole="hero"
                      invitationId={invitationId}
                      label="the portrait"
                      onAssetsChanged={refreshAssets}
                      onChange={(assetId) =>
                        edit((current) => ({
                          ...current,
                          hero: { ...current.hero, imageAssetId: assetId },
                        }))
                      }
                    />
                  </SectionCard>
                );
              }

              if (key === "message") {
                return (
                  <SectionCard key={key} {...cardProps}>
                    <TextField
                      id="lb-message-heading"
                      label="Heading"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          message: { ...current.message, heading: value },
                        }))
                      }
                      requirement="Optional · 120 characters"
                      value={state.message.heading}
                    />
                    <TextField
                      id="lb-message-body"
                      invalid={blank(state.message.body)}
                      label="Your message"
                      maxLength={10_000}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          message: { ...current.message, body: value },
                        }))
                      }
                      requirement="Required"
                      rows={5}
                      value={state.message.body}
                    />
                    <TextField
                      id="lb-message-signature-lead"
                      label="Signed"
                      maxLength={80}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          message: { ...current.message, signatureLead: value },
                        }))
                      }
                      placeholder="With love, her parents"
                      requirement="Optional · 80 characters"
                      value={state.message.signatureLead}
                    />
                    <div className={styles.collection}>
                      <p className={styles.collectionLabel}>
                        Names <span>Up to 4</span>
                      </p>
                      <p className={styles.fieldHint}>
                        A name left blank is simply left out. Remove every name to drop the
                        signature entirely.
                      </p>
                      {state.message.signatureNames.map((name, index) => (
                        <CollectionItem
                          canRemove
                          controlLabel={`name ${index + 1}`}
                          index={index}
                          key={index}
                          onMove={(direction) =>
                            edit((current) => ({
                              ...current,
                              message: {
                                ...current.message,
                                signatureNames: moveItem(
                                  current.message.signatureNames,
                                  index,
                                  direction,
                                ),
                              },
                            }))
                          }
                          onRemove={() =>
                            edit((current) => ({
                              ...current,
                              message: {
                                ...current.message,
                                signatureNames: removeAt(current.message.signatureNames, index),
                              },
                            }))
                          }
                          title={`Name ${index + 1}`}
                          total={state.message.signatureNames.length}
                        >
                          <TextField
                            id={`lb-message-name-${index}`}
                            label="Name"
                            maxLength={120}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                message: {
                                  ...current.message,
                                  signatureNames: replaceAt(
                                    current.message.signatureNames,
                                    index,
                                    value,
                                  ),
                                },
                              }))
                            }
                            requirement="Required · 120 characters"
                            value={name}
                          />
                        </CollectionItem>
                      ))}
                      <AddItemButton
                        atLimit={state.message.signatureNames.length >= 4}
                        label="Add a name"
                        onAdd={() =>
                          edit((current) => ({
                            ...current,
                            message: {
                              ...current.message,
                              signatureNames: [...current.message.signatureNames, ""],
                            },
                          }))
                        }
                      />
                    </div>
                  </SectionCard>
                );
              }

              if (key === "countdown") {
                return (
                  <SectionCard key={key} {...cardProps}>
                    <TextField
                      id="lb-countdown-heading"
                      label="Heading"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          countdown: { ...current.countdown, heading: value },
                        }))
                      }
                      requirement="Optional · 120 characters"
                      value={state.countdown.heading}
                    />
                    <DateTimeField
                      date={state.countdown.date}
                      id="lb-countdown-target"
                      label="Counting down to"
                      onChange={(next) =>
                        edit((current) => ({
                          ...current,
                          countdown: { ...current.countdown, date: next.date, time: next.time },
                        }))
                      }
                      time={state.countdown.time}
                    />
                    <TextField
                      hint="Shown when the countdown cannot run, so keep it readable on its own."
                      id="lb-countdown-label"
                      invalid={blank(state.countdown.dateLabel)}
                      label="Written date and time"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          countdown: { ...current.countdown, dateLabel: value },
                        }))
                      }
                      requirement="Required · 120 characters"
                      value={state.countdown.dateLabel}
                    />
                  </SectionCard>
                );
              }

              if (key === "event-details") {
                return (
                  <SectionCard key={key} {...cardProps}>
                    <TextField
                      id="lb-events-heading"
                      label="Heading"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          eventDetails: { ...current.eventDetails, heading: value },
                        }))
                      }
                      requirement="Optional · 120 characters"
                      value={state.eventDetails.heading}
                    />
                    <div className={styles.collection}>
                      {state.eventDetails.events.map((event, index) => (
                        <CollectionItem
                          canRemove={state.eventDetails.events.length > 1}
                          controlLabel={`event ${index + 1}`}
                          index={index}
                          key={index}
                          onMove={(direction) =>
                            edit((current) => ({
                              ...current,
                              eventDetails: {
                                ...current.eventDetails,
                                events: moveItem(current.eventDetails.events, index, direction),
                              },
                            }))
                          }
                          onRemove={() =>
                            edit((current) => ({
                              ...current,
                              eventDetails: {
                                ...current.eventDetails,
                                events: removeAt(current.eventDetails.events, index),
                              },
                            }))
                          }
                          title={`Event ${index + 1}`}
                          total={state.eventDetails.events.length}
                        >
                          <TextField
                            id={`lb-event-label-${index}`}
                            invalid={blank(event.label)}
                            label="What happens"
                            maxLength={120}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                eventDetails: {
                                  ...current.eventDetails,
                                  events: replaceAt(current.eventDetails.events, index, {
                                    ...event,
                                    label: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Required · 120 characters"
                            value={event.label}
                          />
                          <DateTimeField
                            date={event.date}
                            id={`lb-event-start-${index}`}
                            label="Date"
                            onChange={(next) =>
                              edit((current) => ({
                                ...current,
                                eventDetails: {
                                  ...current.eventDetails,
                                  events: replaceAt(current.eventDetails.events, index, {
                                    ...event,
                                    date: next.date,
                                    time: next.time,
                                  }),
                                },
                              }))
                            }
                            time={event.time}
                          />
                          <TextField
                            id={`lb-event-time-label-${index}`}
                            invalid={blank(event.dateLabel)}
                            label="Time as guests read it"
                            maxLength={120}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                eventDetails: {
                                  ...current.eventDetails,
                                  events: replaceAt(current.eventDetails.events, index, {
                                    ...event,
                                    dateLabel: value,
                                  }),
                                },
                              }))
                            }
                            placeholder="9:00 AM"
                            requirement="Required · 120 characters"
                            value={event.dateLabel}
                          />
                          <TextField
                            id={`lb-event-venue-${index}`}
                            invalid={blank(event.venueName)}
                            label="Venue name"
                            maxLength={120}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                eventDetails: {
                                  ...current.eventDetails,
                                  events: replaceAt(current.eventDetails.events, index, {
                                    ...event,
                                    venueName: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Required · 120 characters"
                            value={event.venueName}
                          />
                          <TextField
                            id={`lb-event-address-${index}`}
                            invalid={blank(event.address)}
                            label="Address"
                            maxLength={500}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                eventDetails: {
                                  ...current.eventDetails,
                                  events: replaceAt(current.eventDetails.events, index, {
                                    ...event,
                                    address: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Required · 500 characters"
                            rows={2}
                            value={event.address}
                          />
                          <TextField
                            id={`lb-event-map-${index}`}
                            label="Map link"
                            maxLength={2048}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                eventDetails: {
                                  ...current.eventDetails,
                                  events: replaceAt(current.eventDetails.events, index, {
                                    ...event,
                                    mapUrl: value,
                                  }),
                                },
                              }))
                            }
                            placeholder="https://maps.google.com/…"
                            requirement="Optional · https link"
                            value={event.mapUrl}
                          />
                          <TextField
                            id={`lb-event-note-${index}`}
                            label="Arrival note"
                            maxLength={500}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                eventDetails: {
                                  ...current.eventDetails,
                                  events: replaceAt(current.eventDetails.events, index, {
                                    ...event,
                                    arrivalNote: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Optional · 500 characters"
                            rows={2}
                            value={event.arrivalNote}
                          />
                          <VenueLocationPicker
                            idPrefix={`lb-event-${index}`}
                            latitude={event.latitude}
                            longitude={event.longitude}
                            onChange={(next) =>
                              edit((current) => ({
                                ...current,
                                eventDetails: {
                                  ...current.eventDetails,
                                  events: replaceAt(current.eventDetails.events, index, {
                                    ...event,
                                    latitude: next.latitude,
                                    longitude: next.longitude,
                                  }),
                                },
                              }))
                            }
                            tileKey={mapTileKey}
                            venueName={event.venueName}
                          />
                        </CollectionItem>
                      ))}
                      <AddItemButton
                        atLimit={state.eventDetails.events.length >= 4}
                        label="Add another gathering"
                        onAdd={() =>
                          edit((current) => ({
                            ...current,
                            eventDetails: {
                              ...current.eventDetails,
                              events: [
                                ...current.eventDetails.events,
                                {
                                  address: "",
                                  arrivalNote: "",
                                  date: "",
                                  dateLabel: "",
                                  label: "",
                                  latitude: "",
                                  longitude: "",
                                  mapUrl: "",
                                  time: "",
                                  venueName: "",
                                },
                              ],
                            },
                          }))
                        }
                      />
                    </div>
                  </SectionCard>
                );
              }

              if (key === "participants") {
                return (
                  <SectionCard key={key} {...cardProps}>
                    <TextField
                      id="lb-participants-heading"
                      label="Heading"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          participants: { ...current.participants, heading: value },
                        }))
                      }
                      requirement="Optional · 120 characters"
                      value={state.participants.heading}
                    />
                    <div className={styles.collection}>
                      {state.participants.groups.map((group, index) => (
                        <CollectionItem
                          canRemove
                          controlLabel={`list ${index + 1}`}
                          index={index}
                          key={index}
                          onMove={(direction) =>
                            edit((current) => ({
                              ...current,
                              participants: {
                                ...current.participants,
                                groups: moveItem(current.participants.groups, index, direction),
                              },
                            }))
                          }
                          onRemove={() =>
                            promptOrRemove(key, state.participants.groups.length, () =>
                              edit((current) => ({
                                ...current,
                                participants: {
                                  ...current.participants,
                                  groups: removeAt(current.participants.groups, index),
                                },
                              })),
                            )
                          }
                          title={group.label || `List ${index + 1}`}
                          total={state.participants.groups.length}
                        >
                          <TextField
                            id={`lb-participants-label-${index}`}
                            invalid={blank(group.label)}
                            label="Who they are"
                            maxLength={120}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                participants: {
                                  ...current.participants,
                                  groups: replaceAt(current.participants.groups, index, {
                                    ...group,
                                    label: value,
                                  }),
                                },
                              }))
                            }
                            placeholder="Tito"
                            requirement="Required · 120 characters"
                            value={group.label}
                          />
                          <TextField
                            errorText="Add at least one name of 120 characters or fewer."
                            hint="One name per line."
                            id={`lb-participants-names-${index}`}
                            invalid={
                              group.names.every((name) => blank(name)) ||
                              group.names.some((name) => name.trim().length > 120)
                            }
                            label="Names"
                            maxLength={2560}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                participants: {
                                  ...current.participants,
                                  groups: replaceAt(current.participants.groups, index, {
                                    ...group,
                                    names: value.split("\n").slice(0, 20),
                                  }),
                                },
                              }))
                            }
                            requirement="Required · up to 20"
                            rows={4}
                            value={group.names.join("\n")}
                          />
                        </CollectionItem>
                      ))}
                      <AddItemButton
                        atLimit={state.participants.groups.length >= 4}
                        label="Add another list"
                        onAdd={() =>
                          edit((current) => ({
                            ...current,
                            participants: {
                              ...current.participants,
                              groups: [...current.participants.groups, { label: "", names: [""] }],
                            },
                          }))
                        }
                      />
                      {lastItemPrompt === key ? (
                        <LastItemNotice
                          message="Ninong and ninang needs at least one list. Hiding the section keeps what you have written."
                          onHideSection={() => setVisible(key, false)}
                        />
                      ) : null}
                    </div>
                  </SectionCard>
                );
              }

              if (key === "schedule") {
                return (
                  <SectionCard key={key} {...cardProps}>
                    <TextField
                      id="lb-schedule-heading"
                      label="Heading"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          schedule: { ...current.schedule, heading: value },
                        }))
                      }
                      requirement="Optional · 120 characters"
                      value={state.schedule.heading}
                    />
                    <div className={styles.collection}>
                      {state.schedule.items.map((item, index) => (
                        <CollectionItem
                          canRemove
                          controlLabel={`moment ${index + 1}`}
                          index={index}
                          key={index}
                          onMove={(direction) =>
                            edit((current) => ({
                              ...current,
                              schedule: {
                                ...current.schedule,
                                items: moveItem(current.schedule.items, index, direction),
                              },
                            }))
                          }
                          onRemove={() =>
                            promptOrRemove(key, state.schedule.items.length, () =>
                              edit((current) => ({
                                ...current,
                                schedule: {
                                  ...current.schedule,
                                  items: removeAt(current.schedule.items, index),
                                },
                              })),
                            )
                          }
                          title={item.title || `Moment ${index + 1}`}
                          total={state.schedule.items.length}
                        >
                          <TextField
                            id={`lb-schedule-time-${index}`}
                            invalid={blank(item.timeLabel)}
                            label="Time"
                            maxLength={80}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                schedule: {
                                  ...current.schedule,
                                  items: replaceAt(current.schedule.items, index, {
                                    ...item,
                                    timeLabel: value,
                                  }),
                                },
                              }))
                            }
                            placeholder="9:00 AM"
                            requirement="Required · 80 characters"
                            value={item.timeLabel}
                          />
                          <TextField
                            id={`lb-schedule-title-${index}`}
                            invalid={blank(item.title)}
                            label="What happens"
                            maxLength={120}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                schedule: {
                                  ...current.schedule,
                                  items: replaceAt(current.schedule.items, index, {
                                    ...item,
                                    title: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Required · 120 characters"
                            value={item.title}
                          />
                          <TextField
                            id={`lb-schedule-description-${index}`}
                            label="A little more"
                            maxLength={500}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                schedule: {
                                  ...current.schedule,
                                  items: replaceAt(current.schedule.items, index, {
                                    ...item,
                                    description: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Optional · 500 characters"
                            rows={2}
                            value={item.description}
                          />
                        </CollectionItem>
                      ))}
                      <AddItemButton
                        atLimit={state.schedule.items.length >= 12}
                        label="Add a moment"
                        onAdd={() =>
                          edit((current) => ({
                            ...current,
                            schedule: {
                              ...current.schedule,
                              items: [
                                ...current.schedule.items,
                                { description: "", timeLabel: "", title: "" },
                              ],
                            },
                          }))
                        }
                      />
                      {lastItemPrompt === key ? (
                        <LastItemNotice
                          message="The order of the day needs at least one moment. Hiding the section keeps what you have written."
                          onHideSection={() => setVisible(key, false)}
                        />
                      ) : null}
                    </div>
                  </SectionCard>
                );
              }

              if (key === "attire") {
                return (
                  <SectionCard key={key} {...cardProps}>
                    <TextField
                      id="lb-attire-heading"
                      label="Heading"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          attire: { ...current.attire, heading: value },
                        }))
                      }
                      requirement="Optional · 120 characters"
                      value={state.attire.heading}
                    />
                    <TextField
                      id="lb-attire-description"
                      invalid={blank(state.attire.description)}
                      label="What everyone should know"
                      maxLength={500}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          attire: { ...current.attire, description: value },
                        }))
                      }
                      requirement="Required · 500 characters"
                      rows={3}
                      value={state.attire.description}
                    />
                    <div className={styles.collection}>
                      <p className={styles.collectionLabel}>
                        Colors <span>Up to 6</span>
                      </p>
                      {state.attire.colors.map((color, index) => (
                        <CollectionItem
                          canRemove
                          controlLabel={`color ${index + 1}`}
                          index={index}
                          key={index}
                          onMove={(direction) =>
                            edit((current) => ({
                              ...current,
                              attire: {
                                ...current.attire,
                                colors: moveItem(current.attire.colors, index, direction),
                              },
                            }))
                          }
                          onRemove={() =>
                            edit((current) => ({
                              ...current,
                              attire: {
                                ...current.attire,
                                colors: removeAt(current.attire.colors, index),
                              },
                            }))
                          }
                          title={color.label || `Color ${index + 1}`}
                          total={state.attire.colors.length}
                        >
                          <ColorField
                            id={`lb-attire-color-${index}`}
                            label={color.label}
                            onChange={(next) =>
                              edit((current) => ({
                                ...current,
                                attire: {
                                  ...current.attire,
                                  colors: replaceAt(current.attire.colors, index, next),
                                },
                              }))
                            }
                            value={color.value}
                          />
                        </CollectionItem>
                      ))}
                      <AddItemButton
                        atLimit={state.attire.colors.length >= 6}
                        label="Add a color"
                        onAdd={() =>
                          edit((current) => ({
                            ...current,
                            attire: {
                              ...current.attire,
                              colors: [...current.attire.colors, { label: "", value: "#dd7f9b" }],
                            },
                          }))
                        }
                      />
                    </div>

                    <div className={styles.collection}>
                      <p className={styles.collectionLabel}>
                        Dress codes by guest <span>Up to 4</span>
                      </p>
                      <p className={styles.fieldHint}>
                        Every guest sees every dress code, each under its own heading.
                      </p>
                      {state.attire.groups.map((group, index) => (
                        <CollectionItem
                          canRemove
                          controlLabel={`dress code ${index + 1}`}
                          index={index}
                          key={index}
                          onMove={(direction) =>
                            edit((current) => ({
                              ...current,
                              attire: {
                                ...current.attire,
                                groups: moveItem(current.attire.groups, index, direction),
                              },
                            }))
                          }
                          onRemove={() =>
                            edit((current) => ({
                              ...current,
                              attire: {
                                ...current.attire,
                                groups: removeAt(current.attire.groups, index),
                              },
                            }))
                          }
                          title={group.label || `Dress code ${index + 1}`}
                          total={state.attire.groups.length}
                        >
                          <TextField
                            id={`lb-attire-group-label-${index}`}
                            invalid={blank(group.label)}
                            label="Who this is for"
                            maxLength={120}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                attire: {
                                  ...current.attire,
                                  groups: replaceAt(current.attire.groups, index, {
                                    ...group,
                                    label: value,
                                  }),
                                },
                              }))
                            }
                            placeholder="Ninong and ninang"
                            requirement="Required · 120 characters"
                            value={group.label}
                          />
                          <TextField
                            id={`lb-attire-group-description-${index}`}
                            invalid={blank(group.description)}
                            label="What to wear"
                            maxLength={500}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                attire: {
                                  ...current.attire,
                                  groups: replaceAt(current.attire.groups, index, {
                                    ...group,
                                    description: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Required · 500 characters"
                            rows={3}
                            value={group.description}
                          />
                          <div className={styles.collection}>
                            <p className={styles.collectionLabel}>
                              Colors for this group <span>Up to 6</span>
                            </p>
                            {group.colors.map((color, colorIndex) => (
                              <CollectionItem
                                canRemove
                                controlLabel={`color ${colorIndex + 1} for ${
                                  group.label || `dress code ${index + 1}`
                                }`}
                                index={colorIndex}
                                key={colorIndex}
                                onMove={(direction) =>
                                  edit((current) => ({
                                    ...current,
                                    attire: {
                                      ...current.attire,
                                      groups: replaceAt(current.attire.groups, index, {
                                        ...group,
                                        colors: moveItem(group.colors, colorIndex, direction),
                                      }),
                                    },
                                  }))
                                }
                                onRemove={() =>
                                  edit((current) => ({
                                    ...current,
                                    attire: {
                                      ...current.attire,
                                      groups: replaceAt(current.attire.groups, index, {
                                        ...group,
                                        colors: removeAt(group.colors, colorIndex),
                                      }),
                                    },
                                  }))
                                }
                                title={color.label || `Color ${colorIndex + 1}`}
                                total={group.colors.length}
                              >
                                <ColorField
                                  id={`lb-attire-group-${index}-color-${colorIndex}`}
                                  label={color.label}
                                  onChange={(next) =>
                                    edit((current) => ({
                                      ...current,
                                      attire: {
                                        ...current.attire,
                                        groups: replaceAt(current.attire.groups, index, {
                                          ...group,
                                          colors: replaceAt(group.colors, colorIndex, next),
                                        }),
                                      },
                                    }))
                                  }
                                  value={color.value}
                                />
                              </CollectionItem>
                            ))}
                            <AddItemButton
                              atLimit={group.colors.length >= 6}
                              label="Add a color for this group"
                              onAdd={() =>
                                edit((current) => ({
                                  ...current,
                                  attire: {
                                    ...current.attire,
                                    groups: replaceAt(current.attire.groups, index, {
                                      ...group,
                                      colors: [...group.colors, { label: "", value: "#dd7f9b" }],
                                    }),
                                  },
                                }))
                              }
                            />
                          </div>
                        </CollectionItem>
                      ))}
                      <AddItemButton
                        atLimit={state.attire.groups.length >= 4}
                        label="Add a dress code"
                        onAdd={() =>
                          edit((current) => ({
                            ...current,
                            attire: {
                              ...current.attire,
                              groups: [
                                ...current.attire.groups,
                                { colors: [], description: "", label: "" },
                              ],
                            },
                          }))
                        }
                      />
                    </div>
                  </SectionCard>
                );
              }

              if (key === "gallery") {
                return (
                  <SectionCard key={key} {...cardProps}>
                    <TextField
                      id="lb-gallery-heading"
                      label="Heading"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          gallery: { ...current.gallery, heading: value },
                        }))
                      }
                      requirement="Optional · 120 characters"
                      value={state.gallery.heading}
                    />
                    <TextField
                      id="lb-gallery-description"
                      label="A line of introduction"
                      maxLength={500}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          gallery: { ...current.gallery, description: value },
                        }))
                      }
                      requirement="Optional · 500 characters"
                      rows={2}
                      value={state.gallery.description}
                    />
                    <div className={styles.collection}>
                      <p className={styles.collectionLabel}>
                        Photographs <span>Up to {MAX_PHOTOS}</span>
                      </p>
                      {state.gallery.images.map((image, index) => (
                        <CollectionItem
                          canRemove
                          controlLabel={`photograph ${index + 1}`}
                          index={index}
                          key={image.assetId}
                          onMove={(direction) =>
                            edit((current) => ({
                              ...current,
                              gallery: {
                                ...current.gallery,
                                images: moveItem(current.gallery.images, index, direction),
                              },
                            }))
                          }
                          onRemove={() =>
                            promptOrRemove(key, state.gallery.images.length, () =>
                              edit((current) => ({
                                ...current,
                                gallery: {
                                  ...current.gallery,
                                  images: removeAt(current.gallery.images, index),
                                },
                              })),
                            )
                          }
                          title={image.title || `Photograph ${index + 1}`}
                          total={state.gallery.images.length}
                        >
                          <LittleBlessingsImageField
                            allowRemove={false}
                            asset={assetsById.get(image.assetId)}
                            assetId={image.assetId}
                            imageRole="gallery"
                            invitationId={invitationId}
                            label={`photograph ${index + 1}`}
                            onAssetsChanged={refreshAssets}
                            onChange={(assetId) => {
                              if (!assetId) return;
                              edit((current) => ({
                                ...current,
                                gallery: {
                                  ...current.gallery,
                                  images: replaceAt(current.gallery.images, index, {
                                    ...image,
                                    assetId,
                                  }),
                                },
                              }));
                            }}
                          />
                          <TextField
                            id={`lb-gallery-title-${index}`}
                            label="Title"
                            maxLength={240}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                gallery: {
                                  ...current.gallery,
                                  images: replaceAt(current.gallery.images, index, {
                                    ...image,
                                    title: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Optional · 240 characters"
                            value={image.title}
                          />
                          <TextField
                            hint="A short description helps guests using a screen reader."
                            id={`lb-gallery-caption-${index}`}
                            label="Description"
                            maxLength={240}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                gallery: {
                                  ...current.gallery,
                                  images: replaceAt(current.gallery.images, index, {
                                    ...image,
                                    caption: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Optional · 240 characters"
                            rows={2}
                            value={image.caption}
                          />
                        </CollectionItem>
                      ))}
                      <GalleryPhotoAdder
                        atLimit={state.gallery.images.length >= MAX_PHOTOS}
                        invitationId={invitationId}
                        onAdded={(assetId) =>
                          edit((current) => ({
                            ...current,
                            gallery: {
                              ...current.gallery,
                              images: [
                                ...current.gallery.images,
                                { assetId, caption: "", title: "" },
                              ],
                            },
                          }))
                        }
                        onAssetsChanged={refreshAssets}
                      />
                      {lastItemPrompt === key ? (
                        <LastItemNotice
                          message="Little moments needs at least one photograph. Hiding the section keeps your uploads."
                          onHideSection={() => setVisible(key, false)}
                        />
                      ) : null}
                    </div>
                  </SectionCard>
                );
              }

              if (key === "guidance") {
                return (
                  <SectionCard key={key} {...cardProps}>
                    <TextField
                      id="lb-guidance-heading"
                      label="Heading"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          guidance: { ...current.guidance, heading: value },
                        }))
                      }
                      requirement="Optional · 120 characters"
                      value={state.guidance.heading}
                    />
                    <div className={styles.collection}>
                      <p className={styles.collectionLabel}>
                        Notes <span>Up to 8</span>
                      </p>
                      {state.guidance.items.map((item, index) => (
                        <CollectionItem
                          canRemove
                          controlLabel={`note ${index + 1}`}
                          index={index}
                          key={index}
                          onMove={(direction) =>
                            edit((current) => ({
                              ...current,
                              guidance: {
                                ...current.guidance,
                                items: moveItem(current.guidance.items, index, direction),
                              },
                            }))
                          }
                          onRemove={() =>
                            promptOrRemove(key, state.guidance.items.length, () =>
                              edit((current) => ({
                                ...current,
                                guidance: {
                                  ...current.guidance,
                                  items: removeAt(current.guidance.items, index),
                                },
                              })),
                            )
                          }
                          title={`Note ${index + 1}`}
                          total={state.guidance.items.length}
                        >
                          <TextField
                            id={`lb-guidance-item-${index}`}
                            invalid={blank(item)}
                            label="Note"
                            maxLength={500}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                guidance: {
                                  ...current.guidance,
                                  items: replaceAt(current.guidance.items, index, value),
                                },
                              }))
                            }
                            requirement="Required · 500 characters"
                            rows={2}
                            value={item}
                          />
                        </CollectionItem>
                      ))}
                      <AddItemButton
                        atLimit={state.guidance.items.length >= 8}
                        label="Add a note"
                        onAdd={() =>
                          edit((current) => ({
                            ...current,
                            guidance: {
                              ...current.guidance,
                              items: [...current.guidance.items, ""],
                            },
                          }))
                        }
                      />
                      {lastItemPrompt === key ? (
                        <LastItemNotice
                          message="A gentle note needs at least one line. Hiding the section keeps what you have written."
                          onHideSection={() => setVisible(key, false)}
                        />
                      ) : null}
                    </div>
                  </SectionCard>
                );
              }

              if (key === "gifts") {
                return (
                  <SectionCard key={key} {...cardProps}>
                    <TextField
                      id="lb-gifts-heading"
                      label="Heading"
                      maxLength={120}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          gifts: { ...current.gifts, heading: value },
                        }))
                      }
                      requirement="Optional · 120 characters"
                      value={state.gifts.heading}
                    />
                    <TextField
                      id="lb-gifts-message"
                      label="A line of introduction"
                      maxLength={500}
                      onChange={(value) =>
                        edit((current) => ({
                          ...current,
                          gifts: { ...current.gifts, message: value },
                        }))
                      }
                      requirement="Optional · 500 characters"
                      rows={2}
                      value={state.gifts.message}
                    />
                    <div className={styles.collection}>
                      <p className={styles.collectionLabel}>
                        Ideas <span>Up to {MAX_GIFTS}</span>
                      </p>
                      {state.gifts.items.map((item, index) => (
                        <CollectionItem
                          canRemove
                          controlLabel={`gift idea ${index + 1}`}
                          index={index}
                          key={index}
                          onMove={(direction) =>
                            edit((current) => ({
                              ...current,
                              gifts: {
                                ...current.gifts,
                                items: moveItem(current.gifts.items, index, direction),
                              },
                            }))
                          }
                          onRemove={() =>
                            promptOrRemove(key, state.gifts.items.length, () =>
                              edit((current) => ({
                                ...current,
                                gifts: {
                                  ...current.gifts,
                                  items: removeAt(current.gifts.items, index),
                                },
                              })),
                            )
                          }
                          title={item.name || `Gift idea ${index + 1}`}
                          total={state.gifts.items.length}
                        >
                          <TextField
                            id={`lb-gift-name-${index}`}
                            invalid={blank(item.name)}
                            label="Gift idea"
                            maxLength={120}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                gifts: {
                                  ...current.gifts,
                                  items: replaceAt(current.gifts.items, index, {
                                    ...item,
                                    name: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Required · 120 characters"
                            value={item.name}
                          />
                          <TextField
                            id={`lb-gift-note-${index}`}
                            label="A little more"
                            maxLength={240}
                            onChange={(value) =>
                              edit((current) => ({
                                ...current,
                                gifts: {
                                  ...current.gifts,
                                  items: replaceAt(current.gifts.items, index, {
                                    ...item,
                                    note: value,
                                  }),
                                },
                              }))
                            }
                            requirement="Optional · 240 characters"
                            rows={2}
                            value={item.note}
                          />
                          <LittleBlessingsImageField
                            asset={
                              item.imageAssetId ? assetsById.get(item.imageAssetId) : undefined
                            }
                            assetId={item.imageAssetId}
                            imageRole="gift"
                            invitationId={invitationId}
                            label={`the picture for ${item.name || `gift idea ${index + 1}`}`}
                            onAssetsChanged={refreshAssets}
                            onChange={(assetId) =>
                              edit((current) => ({
                                ...current,
                                gifts: {
                                  ...current.gifts,
                                  items: replaceAt(current.gifts.items, index, {
                                    ...item,
                                    imageAssetId: assetId,
                                  }),
                                },
                              }))
                            }
                          />
                        </CollectionItem>
                      ))}
                      <AddItemButton
                        atLimit={state.gifts.items.length >= MAX_GIFTS}
                        label="Add a gift idea"
                        onAdd={() =>
                          edit((current) => ({
                            ...current,
                            gifts: {
                              ...current.gifts,
                              items: [
                                ...current.gifts.items,
                                { imageAssetId: null, name: "", note: "" },
                              ],
                            },
                          }))
                        }
                      />
                      {lastItemPrompt === key ? (
                        <LastItemNotice
                          message="Gift ideas needs at least one idea. Hiding the section keeps your uploads."
                          onHideSection={() => setVisible(key, false)}
                        />
                      ) : null}
                    </div>
                  </SectionCard>
                );
              }

              return (
                <SectionCard key={key} {...cardProps}>
                  <TextField
                    id="lb-rsvp-heading"
                    label="Heading"
                    maxLength={120}
                    onChange={(value) =>
                      edit((current) => ({ ...current, rsvp: { ...current.rsvp, heading: value } }))
                    }
                    requirement="Optional · 120 characters"
                    value={state.rsvp.heading}
                  />
                  <TextField
                    id="lb-rsvp-message"
                    label="How to reply"
                    maxLength={500}
                    onChange={(value) =>
                      edit((current) => ({ ...current, rsvp: { ...current.rsvp, message: value } }))
                    }
                    requirement="Optional · 500 characters"
                    rows={3}
                    value={state.rsvp.message}
                  />
                  <DateField
                    hint="End of the selected day in Philippine time."
                    id="lb-rsvp-deadline"
                    label="Reply by"
                    onChange={(value) =>
                      edit((current) => ({
                        ...current,
                        rsvp: { ...current.rsvp, deadline: value },
                      }))
                    }
                    value={state.rsvp.deadline}
                  />
                </SectionCard>
              );
            })}
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
                <button onClick={() => window.location.reload()} type="button">
                  Discard and reload
                </button>
              </div>
              {recoveryMessage ? <p role="status">{recoveryMessage}</p> : null}
            </div>
          ) : null}

          {!fieldsAreValid ? (
            <p className={styles.fieldError} role="status">
              Some required details are still empty. Autosave resumes as soon as they are filled in.
            </p>
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
            titleReady={!blank(state.hero.title)}
          />

          <p className={styles.autosaveNote}>
            Autosave begins after a short pause. An unlisted invitation is shareable by anyone who
            has its link, so treat the photographs here as you would any family album.
          </p>
        </aside>

        <div className={styles.previewPanel}>
          <div className={styles.previewHeading}>
            <div>
              <p className={styles.eyebrow}>Live invitation preview</p>
              <h3>Little Blessings</h3>
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

          <fieldset className={styles.audienceSwitch}>
            <legend className={styles.visuallyHidden}>Preview as</legend>
            <button
              aria-pressed={previewAudience === "personalized"}
              onClick={() => setPreviewAudience("personalized")}
              type="button"
            >
              Invited guest
            </button>
            <button
              aria-pressed={previewAudience === "general"}
              onClick={() => setPreviewAudience("general")}
              type="button"
            >
              General link
            </button>
          </fieldset>

          <p className={styles.audienceNote}>
            {previewAudience === "general"
              ? "Anyone with the shared link reads the invitation without a reply section."
              : "A guest who opens their own personal link also sees the reply section."}
          </p>

          <div className={styles.previewFrame}>
            <Renderer
              audience={previewAudience}
              document={previewedDocument}
              mapTileKey={mapTileKey}
              mode="preview"
              onOpeningStateChange={setPreviewOpeningState}
              openingReplayKey={previewReplayKey}
              resolveImage={resolveImage}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

interface GalleryPhotoAdderProps {
  atLimit: boolean;
  invitationId: string;
  onAdded: (assetId: string) => void;
  onAssetsChanged: () => Promise<void>;
}

/**
 * Adds a photograph to the album. A gallery entry cannot exist without an image,
 * so the upload happens first and the entry appears once the picture is ready.
 */
function GalleryPhotoAdder({
  atLimit,
  invitationId,
  onAdded,
  onAssetsChanged,
}: GalleryPhotoAdderProps) {
  if (atLimit) {
    return <p className={styles.fieldHint}>The album holds {MAX_PHOTOS} photographs.</p>;
  }

  return (
    <LittleBlessingsImageField
      asset={undefined}
      assetId={null}
      imageRole="gallery"
      invitationId={invitationId}
      label="a photograph"
      onAssetsChanged={onAssetsChanged}
      onChange={(assetId) => {
        if (assetId) onAdded(assetId);
      }}
    />
  );
}
