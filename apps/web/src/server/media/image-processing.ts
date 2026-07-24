import { createHash } from "node:crypto";

import {
  DELIVERED_IMAGE_CONTENT_TYPE,
  type MediaImageAsset,
  type MediaRendition,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_RENDITION_BYTES,
  mediaImageAssetSchema,
  mediaOriginalObjectKey,
  mediaRenditionObjectKey,
  MIN_IMAGE_DIMENSION,
  MAX_IMAGE_DIMENSION,
  plannedRenditionWidths,
  type UploadableImageContentType,
} from "@invitica/invitation-schema";
import sharp from "sharp";

/**
 * Rejects any upload that is not a decodable, in-bounds, supported image. The
 * message is safe to surface to a creator; it never carries file contents.
 */
export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

const contentTypeByFormat: Record<string, UploadableImageContentType> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const WEBP_QUALITY = 72;

export interface ProcessedRenditionObject {
  readonly rendition: MediaRendition;
  readonly objectKey: string;
  readonly body: Uint8Array;
  readonly contentType: typeof DELIVERED_IMAGE_CONTENT_TYPE;
}

export interface ProcessedImage {
  readonly asset: MediaImageAsset;
  readonly original: {
    readonly objectKey: string;
    readonly body: Uint8Array;
    readonly contentType: UploadableImageContentType;
  };
  readonly renditions: ProcessedRenditionObject[];
}

function sha256Hex(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Decodes owner-supplied image bytes, honors EXIF orientation, and produces the
 * private original plus the compressed responsive WebP renditions. The detected
 * format — not the client-declared content type — decides the stored original,
 * so a mislabeled or non-image upload cannot slip through.
 */
export async function processInvitationImage(input: {
  readonly assetId: string;
  readonly data: Uint8Array;
}): Promise<ProcessedImage> {
  if (input.data.byteLength === 0) {
    throw new InvalidImageError("The uploaded image is empty.");
  }
  if (input.data.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
    throw new InvalidImageError("This image is larger than the allowed size.");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input.data, { failOn: "error" }).rotate().metadata();
  } catch {
    throw new InvalidImageError("This file could not be read as an image.");
  }

  const format = metadata.format ?? "";
  const originalContentType = contentTypeByFormat[format];
  if (!originalContentType) {
    throw new InvalidImageError("This image format is not supported.");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    width < MIN_IMAGE_DIMENSION ||
    height < MIN_IMAGE_DIMENSION ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION
  ) {
    throw new InvalidImageError("This image's dimensions are outside the supported range.");
  }

  const renditions: ProcessedRenditionObject[] = [];
  for (const targetWidth of plannedRenditionWidths(width)) {
    const { data, info } = await sharp(input.data)
      .rotate()
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    if (info.size > MAX_RENDITION_BYTES) {
      throw new InvalidImageError("This image could not be compressed within limits.");
    }

    const body = new Uint8Array(data);
    renditions.push({
      body,
      contentType: DELIVERED_IMAGE_CONTENT_TYPE,
      objectKey: mediaRenditionObjectKey(input.assetId, info.width),
      rendition: {
        byteLength: info.size,
        height: info.height,
        sha256: sha256Hex(body),
        width: info.width,
      },
    });
  }

  const asset = mediaImageAssetSchema.parse({
    height,
    id: input.assetId,
    kind: "image",
    originalByteLength: input.data.byteLength,
    originalContentType,
    originalSha256: sha256Hex(input.data),
    renditions: renditions.map((entry) => entry.rendition),
    width,
  } satisfies MediaImageAsset);

  return {
    asset,
    original: {
      body: input.data,
      contentType: originalContentType,
      objectKey: mediaOriginalObjectKey(input.assetId, originalContentType),
    },
    renditions,
  };
}
