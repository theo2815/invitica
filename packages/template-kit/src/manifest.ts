import {
  CURRENT_INVITATION_SCHEMA_VERSION,
  invitationDocumentV1Schema,
} from "@invitica/invitation-schema";
import { z } from "zod";

export const templateRendererKeySchema = z.enum([
  "standard-v1",
  "garden-promise-v1",
  "little-blessings-v1",
]);
export const templateQualityStatusSchema = z.enum(["production", "fixture"]);
export const templateOccasionSchema = z.enum([
  "Wedding",
  "Birthday",
  "Christening",
  "Baby shower",
  "Debut",
  "Anniversary",
]);
export const templateAccessTierSchema = z.enum(["Free", "Premium"]);
export const templateSectionTypeSchema = z.enum([
  "hero",
  "message",
  "venue",
  "rsvp",
  "countdown",
  "event-details",
  "participants",
  "schedule",
  "attire",
  "gallery",
  "guidance",
  "gifts",
]);

export const templateListingSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  occasion: templateOccasionSchema,
  name: z.string().trim().min(1).max(120),
  previewTitle: z.string().trim().min(1).max(120),
  date: z.string().trim().min(1).max(120),
  tier: templateAccessTierSchema,
  style: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
});

export const templateManifestSchema = z
  .strictObject({
    listing: templateListingSchema,
    templateVersionId: z.string().uuid(),
    version: z.number().int().positive(),
    qualityStatus: templateQualityStatusSchema,
    rendererKey: templateRendererKeySchema,
    schemaVersion: z.literal(CURRENT_INVITATION_SCHEMA_VERSION),
    allowedSections: z.array(templateSectionTypeSchema).min(1),
    defaultDocument: invitationDocumentV1Schema,
    /**
     * The document a new draft starts from, when that differs from the catalog
     * showcase. A showcase may reference media the template ships for its own
     * preview; a creator's first draft must reference none, because an asset
     * that has no uploaded media in *their* invitation cannot be published. A
     * template whose showcase carries no media needs no separate starter.
     */
    starterDocument: invitationDocumentV1Schema.optional(),
  })
  .superRefine((manifest, context) => {
    const allowedSections = new Set(manifest.allowedSections);

    for (const key of ["defaultDocument", "starterDocument"] as const) {
      const document = manifest[key];
      if (!document) continue;

      if (document.templateVersionId !== manifest.templateVersionId) {
        context.addIssue({
          code: "custom",
          message: "Template documents must reference their template version",
          path: [key, "templateVersionId"],
        });
      }

      document.sections.forEach((section, index) => {
        if (!allowedSections.has(section.type)) {
          context.addIssue({
            code: "custom",
            message: `Section type "${section.type}" is not allowed by this template`,
            path: [key, "sections", index, "type"],
          });
        }
      });
    }

    if (manifest.starterDocument) {
      if (manifest.starterDocument.assets.length > 0) {
        context.addIssue({
          code: "custom",
          message: "A starter document must not reference media a creator has not uploaded",
          path: ["starterDocument", "assets"],
        });
      }
    } else if (manifest.defaultDocument.assets.length > 0) {
      context.addIssue({
        code: "custom",
        message: "A template whose showcase carries media must provide a starter document",
        path: ["starterDocument"],
      });
    }
  });

/**
 * The document a new draft is created from. Templates without a starter of
 * their own begin at their showcase, which is only safe when it carries no
 * media references.
 */
export function templateStarterDocument(manifest: TemplateManifest) {
  return manifest.starterDocument ?? manifest.defaultDocument;
}

export type TemplateRendererKey = z.infer<typeof templateRendererKeySchema>;
export type TemplateListing = z.infer<typeof templateListingSchema>;
export type TemplateManifest = z.infer<typeof templateManifestSchema>;
