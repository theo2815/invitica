import {
  attireSectionSchema,
  countdownSectionSchema,
  eventDetailsSectionSchema,
  gallerySectionSchema,
  giftsSectionSchema,
  guidanceSectionSchema,
  heroSectionSchema,
  type InvitationDocument,
  type InvitationSection,
  invitationSectionSchema,
  messageSectionSchema,
  parseInvitationDocument,
  participantsSectionSchema,
  rsvpSectionSchema,
  scheduleSectionSchema,
} from "@invitica/invitation-schema";
import { z } from "zod";

/**
 * The editable Little Blessings surface, shared by the creator editor and the
 * save path. Pure document logic only: this module holds no server access, so
 * the editor can validate and preview an edit in the browser using exactly the
 * contract the server and migration `0016` will enforce.
 */

/**
 * Sections a creator may never hide. The hero carries the celebrant's name,
 * date, and portrait and is the source for the envelope cover plate; without
 * Where and when the invitation cannot do its job.
 */
export const LITTLE_BLESSINGS_REQUIRED_SECTIONS = ["hero", "event-details"] as const;

export class LittleBlessingsSectionError extends Error {
  constructor() {
    super("This invitation does not contain that section.");
    this.name = "LittleBlessingsSectionError";
  }
}

/**
 * A cleared optional field arrives as an empty string from a text input. That
 * means "absent", not "present and blank" — which is also what the database
 * requires, since it rejects blank and untrimmed text rather than rewriting
 * nested JSON.
 */
function withoutBlankFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutBlankFields);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.trim() === "") continue;
    result[key] = withoutBlankFields(entry);
  }

  return result;
}

function editableSection<Props extends z.ZodTypeAny>(props: Props) {
  return z.strictObject({ props, visible: z.boolean() }).optional();
}

function requiredSection<Props extends z.ZodTypeAny>(props: Props) {
  return z.strictObject({ props, visible: z.literal(true) }).optional();
}

/**
 * One entry per section type, each carrying that section's visibility and its
 * complete strict props object. Prop shapes are the document contract's own, so
 * the editor can never drift from what a published invitation may contain.
 */
export const littleBlessingsDetailsSchema = z.preprocess(
  withoutBlankFields,
  z.strictObject({
    attire: editableSection(attireSectionSchema.shape.props),
    countdown: editableSection(countdownSectionSchema.shape.props),
    "event-details": requiredSection(eventDetailsSectionSchema.shape.props),
    gallery: editableSection(gallerySectionSchema.shape.props),
    gifts: editableSection(giftsSectionSchema.shape.props),
    guidance: editableSection(guidanceSectionSchema.shape.props),
    hero: requiredSection(heroSectionSchema.shape.props),
    message: editableSection(messageSectionSchema.shape.props),
    participants: editableSection(participantsSectionSchema.shape.props),
    rsvp: editableSection(rsvpSectionSchema.shape.props),
    schedule: editableSection(scheduleSectionSchema.shape.props),
  }),
);

export type LittleBlessingsDetails = z.infer<typeof littleBlessingsDetailsSchema>;

function referencedImageIds(sections: readonly InvitationSection[]): string[] {
  const ids: string[] = [];

  for (const section of sections) {
    if (section.type === "hero" && section.props.imageAssetId) {
      ids.push(section.props.imageAssetId);
    }

    if (section.type === "gallery") {
      for (const image of section.props.images) ids.push(image.assetId);
    }

    if (section.type === "gifts") {
      for (const item of section.props.items) {
        if (item.imageAssetId) ids.push(item.imageAssetId);
      }
    }
  }

  return [...new Set(ids)];
}

/**
 * Applies an edited section set to a stored document. Sections are never added,
 * removed, or reordered — the curated order is a template property — and a
 * hidden section keeps its content so the publication snapshot stays complete.
 *
 * The asset list is rebuilt from the images the document still references, in
 * document order. Migration `0016` derives it the same way from the same
 * sections, so the creator's preview and the stored document agree.
 */
export function applyLittleBlessingsDetails(
  document: InvitationDocument,
  details: LittleBlessingsDetails,
): InvitationDocument {
  const entries: Record<string, { props: unknown; visible: boolean } | undefined> = details;
  const presentTypes = new Set<string>(document.sections.map((section) => section.type));

  for (const type of Object.keys(entries)) {
    if (!presentTypes.has(type)) {
      throw new LittleBlessingsSectionError();
    }
  }

  const sections = z.array(invitationSectionSchema).parse(
    document.sections.map((section) => {
      const entry = entries[section.type];
      return entry ? { ...section, props: entry.props, visible: entry.visible } : section;
    }),
  );

  const assets = [
    ...document.assets.filter((asset) => asset.kind !== "image"),
    ...referencedImageIds(sections).map((id) => ({ id, kind: "image" as const })),
  ];

  return parseInvitationDocument({ ...document, assets, sections });
}
