import { z } from "zod";

export const CURRENT_INVITATION_SCHEMA_VERSION = 1 as const;

const idSchema = z.string().uuid();
const shortTextSchema = z.string().trim().min(1).max(120);
const bodyTextSchema = z.string().trim().min(1).max(10_000);
const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "Expected a six-digit hex color");

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

export const messageSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("message"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    body: bodyTextSchema,
  }),
});

export const venueSectionSchema = z.strictObject({
  ...sectionBaseShape,
  type: z.literal("venue"),
  props: z.strictObject({
    heading: z.string().trim().max(120).optional(),
    venueName: shortTextSchema,
    address: z.string().trim().min(1).max(500),
    mapUrl: z.string().url().optional(),
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

export const invitationSectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  messageSectionSchema,
  venueSectionSchema,
  rsvpSectionSchema,
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

    const assetIds = new Set<string>();

    document.assets.forEach((asset, index) => {
      if (assetIds.has(asset.id)) {
        context.addIssue({
          code: "custom",
          message: "Asset IDs must be unique",
          path: ["assets", index, "id"],
        });
      }

      assetIds.add(asset.id);
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
