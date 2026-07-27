import { parsePublicationSnapshot } from "@invitica/invitation-schema";
import { invitationFixture } from "@invitica/invitation-schema/testing";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  createPublicationSocialPreview,
  type PublicationSocialPreviewStore,
} from "../src/social-preview.js";

function snapshot(rendererKey: string) {
  return parsePublicationSnapshot({
    assets: [],
    document: invitationFixture,
    draftRevision: 4,
    invitationSchemaVersion: 1,
    rendererKey,
    rendererVersion: 1,
    snapshotVersion: 1,
    templateVersion: 1,
    templateVersionId: invitationFixture.templateVersionId,
  });
}

class MemoryStore implements PublicationSocialPreviewStore {
  readonly objects = new Map<string, Uint8Array>();

  async getBinary(key: string) {
    return this.objects.get(key) ?? null;
  }

  async putBinaryIfAbsent(key: string, body: Uint8Array) {
    if (!this.objects.has(key)) this.objects.set(key, body);
  }
}

describe("publication social preview", () => {
  it("generates a bounded immutable 1200 by 630 JPEG without requiring a hero photo", async () => {
    const store = new MemoryStore();
    const preview = await createPublicationSocialPreview(snapshot("garden-promise-v1"), store);
    const bytes = store.objects.get(preview.objectKey);

    expect(bytes).toBeDefined();
    expect(preview.objectKey).toBe(`publication-social/v1/${preview.sha256}.jpg`);
    expect(preview.byteLength).toBe(bytes?.byteLength);
    await expect(sharp(bytes).metadata()).resolves.toMatchObject({
      format: "jpeg",
      height: 630,
      width: 1200,
    });
  });

  it("keeps the template visual direction in the immutable output", async () => {
    const gardenStore = new MemoryStore();
    const storybookStore = new MemoryStore();
    const garden = await createPublicationSocialPreview(snapshot("garden-promise-v1"), gardenStore);
    const storybook = await createPublicationSocialPreview(
      snapshot("little-blessings-v1"),
      storybookStore,
    );

    expect(storybook.sha256).not.toBe(garden.sha256);
  });

  it("places a bounded hero image into the storybook card", async () => {
    const assetId = "30000000-0000-4000-8000-000000000098";
    const sourceKey = `publication-media/v1/${"9".repeat(64)}/w900.webp`;
    const source = await sharp({
      create: {
        background: "#ead9d8",
        channels: 4,
        height: 1_100,
        width: 900,
      },
    })
      .webp()
      .toBuffer();
    const store = new MemoryStore();
    store.objects.set(sourceKey, source);
    const base = snapshot("little-blessings-v1");
    const document = {
      ...base.document,
      assets: [{ id: assetId, kind: "image" as const }],
      sections: base.document.sections.map((section) =>
        section.type === "hero"
          ? {
              ...section,
              props: { ...section.props, imageAssetId: assetId },
            }
          : section,
      ),
    };
    const publication = parsePublicationSnapshot({
      ...base,
      document,
      assets: [
        {
          contentType: "image/webp",
          height: 1_100,
          id: assetId,
          kind: "image",
          renditions: [
            {
              byteLength: source.byteLength,
              height: 1_100,
              objectKey: sourceKey,
              sha256: "9".repeat(64),
              width: 900,
            },
          ],
          width: 900,
        },
      ],
    });

    const preview = await createPublicationSocialPreview(publication, store);

    expect(store.objects.get(preview.objectKey)).toBeDefined();
  });
});
