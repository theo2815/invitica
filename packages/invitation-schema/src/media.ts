import { z } from "zod";

/**
 * Pure, edge-safe media contracts for creator-supplied invitation images.
 *
 * This module owns only data-only descriptors, bounds, and deterministic
 * object-key derivation. Image decoding, optimization, storage, and provider
 * access live in Node-only application code so this contract stays usable from
 * the renderer and the edge Viewer.
 */

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "Expected a lowercase SHA-256 digest");
const objectKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/, "Expected a safe object-storage key")
  .refine((key) => !key.includes("..") && !key.includes("//"), "Unsafe object-storage key");

/** Formats a creator may upload. Kept narrow to common, phone-native inputs. */
export const UPLOADABLE_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const uploadableImageContentTypeSchema = z.enum(UPLOADABLE_IMAGE_CONTENT_TYPES);
export type UploadableImageContentType = z.infer<typeof uploadableImageContentTypeSchema>;

/** Delivered renditions are always WebP for predictable compression and reach. */
export const DELIVERED_IMAGE_CONTENT_TYPE = "image/webp" as const;

/** Ceiling on the raw upload before any decoding is attempted. */
export const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Reject tiny/broken and absurdly large intrinsic dimensions. */
export const MIN_IMAGE_DIMENSION = 200;
export const MAX_IMAGE_DIMENSION = 8_000;
/** Ceiling on any single compressed rendition. */
export const MAX_RENDITION_BYTES = 1_500_000;

/**
 * Responsive widths generated per image. Widths larger than the intrinsic
 * width are skipped (originals are never upscaled); an image narrower than the
 * smallest target yields a single rendition at its intrinsic width.
 */
export const IMAGE_RENDITION_WIDTHS = [320, 640, 960, 1280] as const;

const extensionByContentType: Record<UploadableImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const positiveIntSchema = z.number().int().positive().safe();
const dimensionSchema = z
  .number()
  .int()
  .min(MIN_IMAGE_DIMENSION)
  .max(MAX_IMAGE_DIMENSION);

/** One compressed responsive rendition. Keys are derived, never stored here. */
export const mediaRenditionSchema = z.strictObject({
  width: positiveIntSchema,
  height: positiveIntSchema,
  byteLength: positiveIntSchema.max(MAX_RENDITION_BYTES),
  sha256: sha256Schema,
});
export type MediaRendition = z.infer<typeof mediaRenditionSchema>;

/**
 * A processed, owner-supplied image ready to be referenced by a draft document
 * asset of the same id. Intrinsic dimensions reserve layout space; renditions
 * are the delivered responsive set.
 */
export const mediaImageAssetSchema = z
  .strictObject({
    id: uuidSchema,
    kind: z.literal("image"),
    width: dimensionSchema,
    height: dimensionSchema,
    originalContentType: uploadableImageContentTypeSchema,
    originalByteLength: positiveIntSchema.max(MAX_IMAGE_UPLOAD_BYTES),
    originalSha256: sha256Schema,
    renditions: z.array(mediaRenditionSchema).min(1).max(IMAGE_RENDITION_WIDTHS.length),
  })
  .superRefine((asset, context) => {
    const widths = new Set<number>();
    asset.renditions.forEach((rendition, index) => {
      if (widths.has(rendition.width)) {
        context.addIssue({
          code: "custom",
          message: "Rendition widths must be unique",
          path: ["renditions", index, "width"],
        });
      }
      widths.add(rendition.width);

      if (rendition.width > asset.width) {
        context.addIssue({
          code: "custom",
          message: "Renditions must not upscale beyond the intrinsic width",
          path: ["renditions", index, "width"],
        });
      }
    });
  });
export type MediaImageAsset = z.infer<typeof mediaImageAssetSchema>;

export function imageFileExtension(contentType: UploadableImageContentType): string {
  return extensionByContentType[uploadableImageContentTypeSchema.parse(contentType)];
}

/**
 * Chooses the responsive rendition widths to generate for an intrinsic width:
 * every target that fits, or a single intrinsic-width rendition when the image
 * is narrower than the smallest target.
 */
export function plannedRenditionWidths(intrinsicWidth: number): number[] {
  const width = dimensionSchema.parse(intrinsicWidth);
  const fitting = IMAGE_RENDITION_WIDTHS.filter((target) => target <= width);
  return fitting.length > 0 ? [...fitting] : [width];
}

/** Private original, addressed by its own asset id. Never publicly served. */
export function mediaOriginalObjectKey(
  assetId: string,
  contentType: UploadableImageContentType,
): string {
  const id = uuidSchema.parse(assetId);
  return objectKeySchema.parse(`media/originals/v1/${id}.${imageFileExtension(contentType)}`);
}

/** Draft-scoped responsive rendition, addressed by asset id and width. */
export function mediaRenditionObjectKey(assetId: string, width: number): string {
  const id = uuidSchema.parse(assetId);
  const parsedWidth = positiveIntSchema.parse(width);
  return objectKeySchema.parse(`media/renditions/v1/${id}/w${parsedWidth}.webp`);
}

/**
 * Immutable, content-addressed publication rendition. Because the key is
 * derived from the rendition digest, identical content deduplicates and no
 * later draft edit can mutate the media referenced by an active snapshot.
 */
export function publicationMediaObjectKey(sha256: string, width: number): string {
  const digest = sha256Schema.parse(sha256);
  const parsedWidth = positiveIntSchema.parse(width);
  return objectKeySchema.parse(`publication-media/v1/${digest}/w${parsedWidth}.webp`);
}
