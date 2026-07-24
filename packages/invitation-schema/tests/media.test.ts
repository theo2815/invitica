import { describe, expect, it } from "vitest";

import {
  IMAGE_RENDITION_WIDTHS,
  imageFileExtension,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_RENDITION_BYTES,
  mediaImageAssetSchema,
  mediaOriginalObjectKey,
  mediaRenditionObjectKey,
  plannedRenditionWidths,
  publicationMediaObjectKey,
} from "../src/index.js";

const assetId = "48000000-0000-4000-8000-000000000001";
const sha = "a".repeat(64);

function baseAsset() {
  return {
    id: assetId,
    kind: "image" as const,
    width: 1600,
    height: 1200,
    originalContentType: "image/jpeg" as const,
    originalByteLength: 820_000,
    originalSha256: sha,
    renditions: [
      { width: 320, height: 240, byteLength: 12_000, sha256: "b".repeat(64) },
      { width: 640, height: 480, byteLength: 40_000, sha256: "c".repeat(64) },
      { width: 960, height: 720, byteLength: 80_000, sha256: "d".repeat(64) },
      { width: 1280, height: 960, byteLength: 140_000, sha256: "e".repeat(64) },
    ],
  };
}

describe("media image asset contract", () => {
  it("accepts a well-formed processed image", () => {
    expect(() => mediaImageAssetSchema.parse(baseAsset())).not.toThrow();
  });

  it("rejects renditions that upscale beyond the intrinsic width", () => {
    const asset = baseAsset();
    asset.width = 900;
    expect(() => mediaImageAssetSchema.parse(asset)).toThrow(/upscale/);
  });

  it("rejects duplicate rendition widths", () => {
    const asset = baseAsset();
    asset.renditions = asset.renditions.map((rendition) => ({ ...rendition, width: 320 }));
    expect(() => mediaImageAssetSchema.parse(asset)).toThrow(/unique/);
  });

  it("rejects an original above the upload ceiling", () => {
    const asset = baseAsset();
    asset.originalByteLength = MAX_IMAGE_UPLOAD_BYTES + 1;
    expect(() => mediaImageAssetSchema.parse(asset)).toThrow();
  });

  it("rejects a rendition above its ceiling", () => {
    const asset = baseAsset();
    asset.renditions = [
      { width: 320, height: 240, byteLength: MAX_RENDITION_BYTES + 1, sha256: "b".repeat(64) },
    ];
    expect(() => mediaImageAssetSchema.parse(asset)).toThrow();
  });

  it("rejects an intrinsic dimension below the minimum", () => {
    const asset = baseAsset();
    asset.width = 100;
    asset.renditions = [{ width: 100, height: 75, byteLength: 5_000, sha256: "f".repeat(64) }];
    expect(() => mediaImageAssetSchema.parse(asset)).toThrow();
  });
});

describe("rendition planning", () => {
  it("keeps every target width that fits the intrinsic width", () => {
    expect(plannedRenditionWidths(1600)).toEqual([...IMAGE_RENDITION_WIDTHS]);
  });

  it("skips target widths larger than the intrinsic width", () => {
    expect(plannedRenditionWidths(700)).toEqual([320, 640]);
  });

  it("falls back to a single intrinsic rendition for narrow images", () => {
    expect(plannedRenditionWidths(280)).toEqual([280]);
  });
});

describe("object keys", () => {
  it("derives a safe, extension-correct private original key", () => {
    expect(mediaOriginalObjectKey(assetId, "image/png")).toBe(`media/originals/v1/${assetId}.png`);
    expect(imageFileExtension("image/webp")).toBe("webp");
  });

  it("derives draft rendition keys by asset id and width", () => {
    expect(mediaRenditionObjectKey(assetId, 640)).toBe(`media/renditions/v1/${assetId}/w640.webp`);
  });

  it("derives content-addressed immutable publication keys", () => {
    expect(publicationMediaObjectKey(sha, 320)).toBe(`publication-media/v1/${sha}/w320.webp`);
  });

  it("rejects malformed identifiers", () => {
    expect(() => mediaOriginalObjectKey("not-a-uuid", "image/jpeg")).toThrow();
    expect(() => publicationMediaObjectKey("nothex", 320)).toThrow();
  });
});
