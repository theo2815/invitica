import { z } from "zod";

export const CURRENT_INVITATION_SCHEMA_VERSION = 1 as const;

const idSchema = z.string().uuid();
const shortTextSchema = z.string().trim().min(1).max(120);
const mediumTextSchema = z.string().trim().min(1).max(500);
const bodyTextSchema = z.string().trim().min(1).max(10_000);
const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "Expected a six-digit hex color");
const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Expected an HTTP or HTTPS URL");

export const animationPresetSchema = z.enum([
  "none",
  "fade-in",
  "fade-up",
  "scale-in",
  "stagger-children",
]);

export const motionStyleSchema = z.enum(["elegant", "playful", "cinematic", "minimal"]);

const sectionBaseShape = {
  id: idSchema,
  visible: z.boolean(),
  animationPreset: animationPresetSchema,
};

export const heroSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("hero"),
  props: z.strictObject({
    eyebrow: z.string().trim().max(80).optional(),
    title: shortTextSchema,
    subtitle: z.string().trim().max(240).optional(),
    dateLabel: z.string().trim().max(120).optional(),
    imageAssetId: idSchema.optional(),
  }),
});

// A closing signature lets a message be attributed to the people who wrote it, such as a
// christening note signed by the parents. Backward compatible: documents without it are unchanged.
const messageSignatureSchema = z.strictObject({
  lead: z.string().trim().max(80).optional(),
  names: z.array(shortTextSchema).min(1).max(4),
});

export const messageSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("message"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    body: bodyTextSchema,
    signature: messageSignatureSchema.optional(),
  }),
});

export const venueSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("venue"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    venueName: shortTextSchema,
    address: z.string().trim().min(1).max(500),
    mapUrl: httpUrlSchema.optional(),
  }),
});

export const rsvpSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("rsvp"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    message: z.string().trim().max(500).optional(),
    deadline: z.string().datetime({ offset: true }).optional(),
  }),
});

export const countdownSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("countdown"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    target: z.string().datetime({ offset: true }),
    dateLabel: shortTextSchema,
  }),
});

const latitudeSchema = z.number().finite().min(-90).max(90);
const longitudeSchema = z.number().finite().min(-180).max(180);

const eventDetailsItemSchema = z.strictObject({
  label: shortTextSchema,
  startAt: z.string().datetime({ offset: true }),
  dateLabel: shortTextSchema,
  venueName: shortTextSchema,
  address: mediumTextSchema,
  mapUrl: httpUrlSchema.optional(),
  arrivalNote: mediumTextSchema.optional(),
  // Optional venue coordinates power the click-to-load guest map (ADR-006). Backward compatible:
  // documents without both values fall back to the "Get directions" link.
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
});

export const eventDetailsSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("event-details"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    events: z.array(eventDetailsItemSchema).min(1).max(4),
  }),
});

const participantGroupSchema = z.strictObject({
  label: shortTextSchema,
  names: z.array(shortTextSchema).min(1).max(20),
});

export const participantsSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("participants"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    groups: z.array(participantGroupSchema).min(1).max(10),
  }),
});

const scheduleItemSchema = z.strictObject({
  timeLabel: z.string().trim().min(1).max(80),
  title: shortTextSchema,
  description: mediumTextSchema.optional(),
});

export const scheduleSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("schedule"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    items: z.array(scheduleItemSchema).min(1).max(16),
  }),
});

const attireColorSchema = z.strictObject({
  label: z.string().trim().min(1).max(80),
  value: hexColorSchema,
});

// An occasion may ask different groups of guests to dress differently, such as a christening that
// asks its godparents for formal wear and its guests for a color family. Backward compatible:
// documents without groups keep showing only the shared description.
const attireGroupSchema = z.strictObject({
  label: shortTextSchema,
  description: mediumTextSchema,
  colors: z.array(attireColorSchema).min(1).max(6).optional(),
});

export const attireSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("attire"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    description: mediumTextSchema,
    colors: z.array(attireColorSchema).min(1).max(6).optional(),
    groups: z.array(attireGroupSchema).min(1).max(4).optional(),
  }),
});

// Both caption fields are optional so a creator can tip in a photograph with no writing under it.
// The image's accessible text is derived by the renderer from the caption, never authored here, so
// a missing title can never produce an unlabelled control.
const galleryImageSchema = z.strictObject({
  assetId: idSchema,
  title: z.string().trim().min(1).max(240).optional(),
  caption: z.string().trim().min(1).max(240).optional(),
});

// A gallery may hold no photographs only while it is hidden, which is how a template ships an album
// a creator has not filled in yet: every other image slot in the contract is optional, so without
// this the gallery alone would force a starter document to reference media that does not exist. The
// "a visible gallery needs at least one photograph" half of the rule is enforced on the whole
// document, where a section's visibility and its contents can be read together.
export const gallerySectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("gallery"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    description: mediumTextSchema.optional(),
    images: z.array(galleryImageSchema).max(8),
  }),
});

export const guidanceSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("guidance"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    items: z.array(mediumTextSchema).min(1).max(8),
  }),
});

const giftItemSchema = z.strictObject({
  imageAssetId: idSchema.optional(),
  name: shortTextSchema,
  note: z.string().trim().min(1).max(240).optional(),
});

export const giftsSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("gifts"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    message: mediumTextSchema.optional(),
    items: z.array(giftItemSchema).min(1).max(8),
  }),
});

export const invitationSectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  messageSectionSchema,
  venueSectionSchema,
  rsvpSectionSchema,
  countdownSectionSchema,
  eventDetailsSectionSchema,
  participantsSectionSchema,
  scheduleSectionSchema,
  attireSectionSchema,
  gallerySectionSchema,
  guidanceSectionSchema,
  giftsSectionSchema,
]);

export const invitationThemeSchema = z.strictObject({
  colors: z.strictObject({
    background: hexColorSchema,
    surface: hexColorSchema,
    text: hexColorSchema,
    accent: hexColorSchema,
    accentContrast: hexColorSchema,
  }),
  typography: z.strictObject({
    headingFontId: z.string().trim().min(1).max(100),
    bodyFontId: z.string().trim().min(1).max(100),
  }),
  spacingScale: z.enum(["compact", "comfortable", "spacious"]),
});

export const invitationOpeningSchema = z.strictObject({
  preset: z.literal("ribbon-envelope-letter"),
  motionStyle: motionStyleSchema,
  recipientMode: z.enum(["generic", "personalized"]),
  fallbackRecipientText: z.string().trim().min(1).max(120),
  audioAssetId: idSchema.optional(),
});

export const invitationAssetReferenceSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(["image", "audio"]),
});

export const invitationDocumentV1Schema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_INVITATION_SCHEMA_VERSION),
    templateVersionId: idSchema,
    locale: z.enum(["en-PH", "fil-PH"]),
    eventTimezone: z.string().trim().min(1).max(100),
    theme: invitationThemeSchema,
    opening: invitationOpeningSchema,
    sections: z.array(invitationSectionSchema).min(1).max(30),
    assets: z.array(invitationAssetReferenceSchema).max(100),
  })
  .superRefine((document, context) => {
    const sectionIds = new Set<string>();

    document.sections.forEach((section, index) => {
      if (sectionIds.has(section.id)) {
        context.addIssue({
          code: "custom",
          message: "Section IDs must be unique",
          path: ["sections", index, "id"],
        });
      }

      sectionIds.add(section.id);
    });

    const assetKinds = new Map<string, "audio" | "image">();

    document.assets.forEach((asset, index) => {
      if (assetKinds.has(asset.id)) {
        context.addIssue({
          code: "custom",
          message: "Asset IDs must be unique",
          path: ["assets", index, "id"],
        });
      }

      assetKinds.set(asset.id, asset.kind);
    });

    const requireAssetKind = (
      assetId: string,
      kind: "audio" | "image",
      path: (string | number)[],
    ) => {
      if (assetKinds.get(assetId) !== kind) {
        context.addIssue({
          code: "custom",
          message: `Referenced ${kind} assets must exist in the invitation document`,
          path,
        });
      }
    };

    if (document.opening.audioAssetId) {
      requireAssetKind(document.opening.audioAssetId, "audio", ["opening", "audioAssetId"]);
    }

    document.sections.forEach((section, sectionIndex) => {
      if (section.type === "hero" && section.props.imageAssetId) {
        requireAssetKind(section.props.imageAssetId, "image", [
          "sections",
          sectionIndex,
          "props",
          "imageAssetId",
        ]);
      }

      if (section.type === "gallery") {
        if (section.visible && section.props.images.length === 0) {
          context.addIssue({
            code: "custom",
            message: "A visible gallery must contain at least one photograph",
            path: ["sections", sectionIndex, "props", "images"],
          });
        }

        section.props.images.forEach((image, imageIndex) => {
          requireAssetKind(image.assetId, "image", [
            "sections",
            sectionIndex,
            "props",
            "images",
            imageIndex,
            "assetId",
          ]);
        });
      }

      if (section.type === "gifts") {
        section.props.items.forEach((item, itemIndex) => {
          if (item.imageAssetId) {
            requireAssetKind(item.imageAssetId, "image", [
              "sections",
              sectionIndex,
              "props",
              "items",
              itemIndex,
              "imageAssetId",
            ]);
          }
        });
      }
    });
  });

export type InvitationDocumentV1 = z.infer<typeof invitationDocumentV1Schema>;
export type InvitationDocument = InvitationDocumentV1;
export type InvitationSection = z.infer<typeof invitationSectionSchema>;

export class UnsupportedInvitationSchemaVersionError extends Error {
  readonly schemaVersion: unknown;

  constructor(schemaVersion: unknown) {
    super(`Unsupported invitation schema version: ${String(schemaVersion)}`);
    this.name = "UnsupportedInvitationSchemaVersionError";
    this.schemaVersion = schemaVersion;
  }
}

export function parseInvitationDocument(input: unknown): InvitationDocument {
  if (typeof input !== "object" || input === null || !("schemaVersion" in input)) {
    throw new UnsupportedInvitationSchemaVersionError(undefined);
  }

  if (input.schemaVersion !== CURRENT_INVITATION_SCHEMA_VERSION) {
    throw new UnsupportedInvitationSchemaVersionError(input.schemaVersion);
  }

  return invitationDocumentV1Schema.parse(input);
}

export function safeParseInvitationDocument(input: unknown) {
  try {
    return {
      success: true as const,
      data: parseInvitationDocument(input),
    };
  } catch (error: unknown) {
    return {
      success: false as const,
      error,
    };
  }
}
