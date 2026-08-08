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

function snapshotWithHeroProps(props: { readonly dateLabel?: string; readonly title?: string }) {
  const base = snapshot("little-blessings-v1");
  return parsePublicationSnapshot({
    ...base,
    document: {
      ...base.document,
      sections: base.document.sections.map((section) =>
        section.type === "hero"
          ? {
              ...section,
              props: { ...section.props, ...props },
            }
          : section,
      ),
    },
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

  it("renders distinct letterforms from the bundled preview fonts", async () => {
    const narrowStore = new MemoryStore();
    const wideStore = new MemoryStore();
    const narrow = await createPublicationSocialPreview(
      snapshotWithHeroProps({ title: "IIIIIIII" }),
      narrowStore,
    );
    const wide = await createPublicationSocialPreview(
      snapshotWithHeroProps({ title: "WWWWWWWW" }),
      wideStore,
    );

    expect(narrow.sha256).not.toBe(wide.sha256);
  });

  it("omits an empty optional date label without failing the publication", async () => {
    const store = new MemoryStore();

    const preview = await createPublicationSocialPreview(
      snapshotWithHeroProps({ dateLabel: "" }),
      store,
    );

    expect(store.objects.get(preview.objectKey)).toBeDefined();
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

  it("names the step that failed instead of one undiagnosable sentence", async () => {
    const assetId = "30000000-0000-4000-8000-000000000097";
    const sourceKey = `publication-media/v1/${"8".repeat(64)}/w900.webp`;
    const base = snapshot("little-blessings-v1");
    const heroDocument = {
      ...base.document,
      assets: [{ id: assetId, kind: "image" as const }],
      sections: base.document.sections.map((section) =>
        section.type === "hero"
          ? { ...section, props: { ...section.props, imageAssetId: assetId } }
          : section,
      ),
    };

    // The snapshot schema requires the manifest to cover every document asset, so an empty manifest
    // cannot be parsed at all. The branch is defensive, and reaching it needs a hand-built snapshot.
    expect(() =>
      parsePublicationSnapshot({ ...base, assets: [], document: heroDocument }),
    ).toThrow();
    await expect(
      createPublicationSocialPreview(
        { ...base, assets: [], document: heroDocument } as unknown as ReturnType<
          typeof parsePublicationSnapshot
        >,
        new MemoryStore(),
      ),
    ).rejects.toMatchObject({ reason: "hero_rendition_missing_from_manifest" });

    // The manifest names a rendition the bucket does not hold. This is the shape a worker and a web
    // app pointed at different buckets produce, and it used to be indistinguishable from the rest.
    const manifest = [
      {
        contentType: "image/webp",
        height: 1_100,
        id: assetId,
        kind: "image",
        renditions: [
          {
            byteLength: 4_096,
            height: 1_100,
            objectKey: sourceKey,
            sha256: "8".repeat(64),
            width: 900,
          },
        ],
        width: 900,
      },
    ];
    const publication = parsePublicationSnapshot({
      ...base,
      assets: manifest,
      document: heroDocument,
    });
    await expect(
      createPublicationSocialPreview(publication, new MemoryStore()),
    ).rejects.toMatchObject({ reason: "hero_rendition_object_absent" });

    // Anything thrown underneath keeps its cause on the error, which is where a stack trace finds it.
    const brokenStore = new MemoryStore();
    brokenStore.objects.set(sourceKey, new Uint8Array([1, 2, 3]));
    const composition = await createPublicationSocialPreview(publication, brokenStore).catch(
      (error: unknown) => error,
    );
    expect(composition).toMatchObject({ reason: "preview_composition_failed" });
    expect((composition as Error).cause).toBeInstanceOf(Error);
  });
});
