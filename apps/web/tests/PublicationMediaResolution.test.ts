import { describe, expect, it, vi } from "vitest";

import type { MediaObjectPutOptions, MediaObjectStore } from "../src/server/media/object-store";
import {
  PublicationMediaUnavailableError,
  resolveInvitationPublicationAssets,
} from "../src/server/media/publication-assets";

const invitationId = "4b000000-0000-4000-8000-000000000001";
const assetId = "4b000000-0000-4000-8000-000000000002";
const shaA = "a".repeat(64);
const shaB = "b".repeat(64);

class FakeStore implements MediaObjectStore {
  readonly copies: Array<{ source: string; destination: string }> = [];
  existingKeys = new Set<string>();

  async put(): Promise<void> {}
  async copy(source: string, destination: string, _options: MediaObjectPutOptions): Promise<void> {
    this.copies.push({ destination, source });
    this.existingKeys.add(destination);
  }
  async head(key: string): Promise<boolean> {
    return this.existingKeys.has(key);
  }
  async delete(): Promise<void> {}
}

function fakeSupabaseWithMedia(row: unknown | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const builder = {
    eq: vi.fn(() => builder),
    maybeSingle,
    select: vi.fn(() => builder),
  };
  const from = vi.fn(() => builder);
  return { client: { from } as never };
}

const readyRow = {
  height: 1200,
  id: assetId,
  renditions: [
    { byteLength: 12000, height: 240, sha256: shaA, width: 320 },
    { byteLength: 40000, height: 480, sha256: shaB, width: 640 },
  ],
  width: 1600,
};

describe("resolveInvitationPublicationAssets", () => {
  it("copies renditions to content-addressed keys and builds the manifest", async () => {
    const store = new FakeStore();
    const { client } = fakeSupabaseWithMedia(readyRow);

    const manifest = await resolveInvitationPublicationAssets(client, store, {
      documentAssets: [{ id: assetId, kind: "image" }],
      invitationId,
    });

    expect(manifest).toEqual([
      {
        contentType: "image/webp",
        height: 1200,
        id: assetId,
        kind: "image",
        renditions: [
          {
            byteLength: 12000,
            height: 240,
            objectKey: `publication-media/v1/${shaA}/w320.webp`,
            sha256: shaA,
            width: 320,
          },
          {
            byteLength: 40000,
            height: 480,
            objectKey: `publication-media/v1/${shaB}/w640.webp`,
            sha256: shaB,
            width: 640,
          },
        ],
        width: 1600,
      },
    ]);
    expect(store.copies).toEqual([
      {
        destination: `publication-media/v1/${shaA}/w320.webp`,
        source: `media/renditions/v1/${assetId}/w320.webp`,
      },
      {
        destination: `publication-media/v1/${shaB}/w640.webp`,
        source: `media/renditions/v1/${assetId}/w640.webp`,
      },
    ]);
  });

  it("skips copying renditions that already exist at their immutable key", async () => {
    const store = new FakeStore();
    store.existingKeys.add(`publication-media/v1/${shaA}/w320.webp`);
    store.existingKeys.add(`publication-media/v1/${shaB}/w640.webp`);
    const { client } = fakeSupabaseWithMedia(readyRow);

    await resolveInvitationPublicationAssets(client, store, {
      documentAssets: [{ id: assetId, kind: "image" }],
      invitationId,
    });

    expect(store.copies).toHaveLength(0);
  });

  it("fails when a referenced image has no ready media row", async () => {
    const store = new FakeStore();
    const { client } = fakeSupabaseWithMedia(null);

    await expect(
      resolveInvitationPublicationAssets(client, store, {
        documentAssets: [{ id: assetId, kind: "image" }],
        invitationId,
      }),
    ).rejects.toBeInstanceOf(PublicationMediaUnavailableError);
  });

  it("rejects unsupported audio references in this batch", async () => {
    const store = new FakeStore();
    const { client } = fakeSupabaseWithMedia(readyRow);

    await expect(
      resolveInvitationPublicationAssets(client, store, {
        documentAssets: [{ id: assetId, kind: "audio" }],
        invitationId,
      }),
    ).rejects.toBeInstanceOf(PublicationMediaUnavailableError);
  });
});
