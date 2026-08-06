import type { InvitationDocument, InvitationSection } from "@invitica/invitation-schema";
import type { TemplateRendererKey } from "@invitica/template-kit";

/**
 * The words and numbers a creator reads on their own section cards.
 *
 * This lived inside `LittleBlessingsDraftEditor.tsx` until 2026-08-06, which is a `"use client"`
 * file — so the server could not see any of it, and Tala could not answer "help me improve
 * Section 5" because the vocabulary the creator was using did not exist on its side of the
 * boundary. Moved here for the same reason `guestPartyInputSchema` left `actions.ts`: two surfaces
 * need one object, and the file it was in could not export it.
 *
 * The editor is still the only thing that renders these. Nothing here decides what may be saved —
 * `sectionDocumentDetailsSchema` and `parseInvitationDocument` do that, unchanged.
 */

export type SectionKey =
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
 * Every section-document template has a curated order. Creators choose what to
 * show, never where it sits, and RSVP remains last whenever it is present.
 */
export const SECTION_ORDER: readonly SectionKey[] = [
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

export interface SectionDocumentEditorProfile {
  attireGroupPlaceholder: string;
  editorEyebrow: string;
  heading: string;
  heroTitleLabel: string;
  lockedSections?: Partial<Record<SectionKey, string>>;
  participantPlaceholder: string;
  previewTitle: string;
  sectionNames: Record<SectionKey, string>;
  signaturePlaceholder: string;
}

const LITTLE_BLESSINGS_EDITOR_PROFILE: SectionDocumentEditorProfile = {
  attireGroupPlaceholder: "Ninong and ninang",
  editorEyebrow: "Little Blessings editor",
  heading: "Tell the story of her day.",
  heroTitleLabel: "The celebrant's name",
  participantPlaceholder: "Tito",
  previewTitle: "Little Blessings",
  sectionNames: SECTION_NAMES,
  signaturePlaceholder: "With love, her parents",
};

const EDITOR_PROFILES: Partial<Record<TemplateRendererKey, SectionDocumentEditorProfile>> = {
  "garden-promise-v2": {
    attireGroupPlaceholder: "Wedding party",
    editorEyebrow: "Garden Promise editor",
    heading: "Plan the whole wedding day.",
    heroTitleLabel: "The couple's names",
    participantPlaceholder: "Parents of the bride",
    previewTitle: "Garden Promise",
    sectionNames: {
      ...SECTION_NAMES,
      attire: "What to wear",
      countdown: "Until the vows",
      "event-details": "Ceremony and reception",
      gallery: "Their story",
      gifts: "Gifts",
      guidance: "Guest notes",
      hero: "The couple",
      message: "Their invitation",
      participants: "Wedding party",
      rsvp: "Reply to the couple",
      schedule: "Wedding-day schedule",
    },
    signaturePlaceholder: "With love, the couple",
  },
  "golden-hour-v2": {
    attireGroupPlaceholder: "Debutante's court",
    editorEyebrow: "Golden Hour editor",
    heading: "Shape her eighteenth-birthday program.",
    heroTitleLabel: "The debutante's name",
    participantPlaceholder: "18 roses",
    previewTitle: "Golden Hour",
    sectionNames: {
      ...SECTION_NAMES,
      attire: "What to wear",
      countdown: "Until the celebration",
      "event-details": "The evening",
      gallery: "Eighteen chapters",
      guidance: "Guest notes",
      hero: "The debutante",
      message: "Her invitation",
      participants: "Her eighteen",
      rsvp: "Reserve your evening",
      schedule: "Program",
    },
    signaturePlaceholder: "With love, her family",
  },
  "little-question-v1": {
    attireGroupPlaceholder: "",
    editorEyebrow: "A Little Question editor",
    heading: "Write one invitation for one person.",
    heroTitleLabel: "Invitation title",
    lockedSections: {
      rsvp: "The question and its private answer are the purpose of this invitation, so this section cannot be hidden.",
    },
    participantPlaceholder: "",
    previewTitle: "A Little Question",
    sectionNames: {
      ...SECTION_NAMES,
      "event-details": "Your date idea",
      gallery: "Favorite moments",
      hero: "For them",
      message: "Why you are asking",
      rsvp: "Your question",
    },
    signaturePlaceholder: "With love, your name",
  },
  "sunday-joy-v2": {
    attireGroupPlaceholder: "Children and grown-ups",
    editorEyebrow: "Sunday Joy editor",
    heading: "Plan a joyful children's party.",
    heroTitleLabel: "The birthday child's name",
    participantPlaceholder: "Party helpers",
    previewTitle: "Sunday Joy",
    sectionNames: {
      ...SECTION_NAMES,
      attire: "What to wear and bring",
      countdown: "Until the party",
      "event-details": "Party place and time",
      gallery: "Favorite moments",
      gifts: "Gifts",
      guidance: "Notes for grown-ups",
      hero: "The birthday child",
      message: "Party invitation",
      participants: "Party helpers",
      rsvp: "Join the party",
      schedule: "Party activities",
    },
    signaturePlaceholder: "With love, the family",
  },
};

export function resolveEditorProfile(
  rendererKey: TemplateRendererKey,
): SectionDocumentEditorProfile {
  return EDITOR_PROFILES[rendererKey] ?? LITTLE_BLESSINGS_EDITOR_PROFILE;
}

export function isSectionKey(type: InvitationSection["type"]): type is SectionKey {
  return SECTION_ORDER.includes(type as SectionKey);
}

/** One section as the creator sees it listed in their editor. */
export interface NumberedSection {
  /** The template's own word for it — "Wedding party", not "participants". */
  name: string;
  /** What the section card shows. One-based. */
  position: number;
  type: SectionKey;
  visible: boolean;
}

/**
 * The section list a creator is looking at, numbered the way their editor numbers it.
 *
 * Derived from the **document** rather than from `SECTION_ORDER`, because that is what the editor
 * does (`LittleBlessingsDraftEditor.tsx`, `sectionOrder`). The number is therefore a property of
 * one invitation, not of its template: a document missing a section renumbers everything below it.
 * Deriving this from the constant instead would produce numbers that quietly disagree with the
 * screen, which is worse than having no numbers at all — a creator asking about "Section 5" would
 * be answered about a different section with total confidence.
 *
 * Hidden sections are numbered too. Visibility is a switch on a card that still exists and is
 * still counted.
 */
export function describeInvitationSections(
  document: InvitationDocument,
  rendererKey: TemplateRendererKey,
): NumberedSection[] {
  const { sectionNames } = resolveEditorProfile(rendererKey);

  return document.sections
    .filter((section): section is Extract<InvitationSection, { type: SectionKey }> =>
      isSectionKey(section.type),
    )
    .map((section, index) => ({
      name: sectionNames[section.type],
      position: index + 1,
      type: section.type,
      visible: section.visible,
    }));
}
