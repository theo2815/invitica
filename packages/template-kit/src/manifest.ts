import {
  CURRENT_INVITATION_SCHEMA_VERSION,
  invitationDocumentV1Schema,
} from "@invitica/invitation-schema";
import { z } from "zod";

export const templateRendererKeySchema = z.enum(["standard-v1"]);
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
export const templateSectionTypeSchema = z.enum(["hero", "message", "venue", "rsvp"]);

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
  })
  .superRefine((manifest, context) => {
    if (manifest.defaultDocument.templateVersionId !== manifest.templateVersionId) {
      context.addIssue({
        code: "custom",
        message: "Default document must reference its template version",
        path: ["defaultDocument", "templateVersionId"],
      });
    }

    const allowedSections = new Set(manifest.allowedSections);

    manifest.defaultDocument.sections.forEach((section, index) => {
      if (!allowedSections.has(section.type)) {
        context.addIssue({
          code: "custom",
          message: `Section type "${section.type}" is not allowed by this template`,
          path: ["defaultDocument", "sections", index, "type"],
        });
      }
    });
  });

export type TemplateRendererKey = z.infer<typeof templateRendererKeySchema>;
export type TemplateListing = z.infer<typeof templateListingSchema>;
export type TemplateManifest = z.infer<typeof templateManifestSchema>;
