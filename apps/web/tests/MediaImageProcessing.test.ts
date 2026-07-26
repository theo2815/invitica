import { IMAGE_RENDITION_WIDTHS, mediaImageAssetSchema } from "@invitica/invitation-schema";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { InvalidImageError, processInvitationImage } from "../src/server/media/image-processing";
import { readR2MediaConfig } from "../src/server/media/object-store";

const assetId = "49000000-0000-4000-8000-000000000001";

async function solidImage(
  width: number,
  height: number,
  format: "jpeg" | "png",
): Promise<Uint8Array> {
  const image = sharp({
    create: { background: { b: 60, g: 120, r: 210 }, channels: 3, height, width },
  });
  const buffer = format === "jpeg" ? await image.jpeg().toBuffer() : await image.png().toBuffer();
  return new Uint8Array(buffer);
}

describe("processInvitationImage", () => {
  it("produces the full responsive rendition set for a large photo", async () => {
    const data = await solidImage(1600, 1200, "jpeg");
    const processed = await processInvitationImage({ assetId, data });

    expect(processed.asset.originalContentType).toBe("image/jpeg");
    expect(processed.asset.width).toBe(1600);
    expect(processed.asset.height).toBe(1200);
    expect(processed.original.objectKey).toBe(`media/originals/v1/${assetId}.jpg`);
    expect(processed.renditions.map((entry) => entry.rendition.width)).toEqual([
      ...IMAGE_RENDITION_WIDTHS,
    ]);
    for (const entry of processed.renditions) {
      expect(entry.contentType).toBe("image/webp");
      expect(entry.objectKey).toBe(`media/renditions/v1/${assetId}/w${entry.rendition.width}.webp`);
      expect(entry.body.byteLength).toBe(entry.rendition.byteLength);
      expect(entry.rendition.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(() => mediaImageAssetSchema.parse(processed.asset)).not.toThrow();
  });

  it("detects the real format and yields a single rendition for a narrow image", async () => {
    const data = await solidImage(280, 210, "png");
    const processed = await processInvitationImage({ assetId, data });

    expect(processed.asset.originalContentType).toBe("image/png");
    expect(processed.original.objectKey).toBe(`media/originals/v1/${assetId}.png`);
    expect(processed.renditions).toHaveLength(1);
    expect(processed.renditions[0]?.rendition.width).toBe(280);
  });

  it("records the delivered orientation for phone photos with EXIF rotation", async () => {
    const data = new Uint8Array(
      await sharp({
        create: {
          background: { b: 60, g: 120, r: 210 },
          channels: 3,
          height: 300,
          width: 400,
        },
      })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer(),
    );
    const processed = await processInvitationImage({ assetId, data });

    expect(processed.asset.width).toBe(300);
    expect(processed.asset.height).toBe(400);
    expect(processed.renditions).toHaveLength(1);
    expect(processed.renditions[0]?.rendition).toMatchObject({ height: 400, width: 300 });
  });

  it("rejects an empty upload", async () => {
    await expect(
      processInvitationImage({ assetId, data: new Uint8Array() }),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("rejects bytes that are not a decodable image", async () => {
    const data = new TextEncoder().encode("this is definitely not an image payload");
    await expect(processInvitationImage({ assetId, data })).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });

  it("rejects an image below the minimum supported dimension", async () => {
    const data = await solidImage(100, 100, "jpeg");
    await expect(processInvitationImage({ assetId, data })).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });
});

describe("readR2MediaConfig", () => {
  it("parses a complete R2 configuration", () => {
    expect(
      readR2MediaConfig({
        R2_ACCESS_KEY_ID: "key",
        R2_BUCKET_NAME: "invitica-storage",
        R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
        R2_SECRET_ACCESS_KEY: "secret",
      }),
    ).toEqual({
      accessKeyId: "key",
      bucket: "invitica-storage",
      endpoint: "https://example.r2.cloudflarestorage.com",
      secretAccessKey: "secret",
    });
  });

  it("rejects an incomplete R2 configuration", () => {
    expect(() => readR2MediaConfig({ R2_BUCKET_NAME: "invitica-storage" })).toThrow();
  });
});
