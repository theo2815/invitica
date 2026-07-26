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
  readonly heads: string[] = [];
  existingKeys = new Set<string>();

  async put(): Promise<void> {}
  async copy(source: string, destination: string, _options: MediaObjectPutOptions): Promise<void> {
    this.copies.push({ destination, source });
    this.existingKeys.add(destination);
  }
  async head(key: string): Promise<boolean> {
    this.heads.push(key);
    return this.existingKeys.has(key);
  }
  async delete(): Promise<void> {}
}

/**
 * Every ready media row for the invitation now arrives from one `in` query, so the
 * terminal call is the awaited builder itself rather than `maybeSingle`.
 */
function fakeSupabaseWithMedia(rows: readonly unknown[]) {
  const result = { data: rows, error: null };
  const builder = {
    eq: vi.fn(() => builder),
    in: vi.fn(() => Promise.resolve(result)),
    select: vi.fn(() => builder),
  };
  const from = vi.fn(() => builder);
  return { builder, client: { from } as never };
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
    const { client } = fakeSupabaseWithMedia([readyRow]);

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

  // Deliberate change: the HEAD probe that used to skip an existing key was removed.
  // A probe and a copy each cost one request, so it only paid off when the key already
  // existed and doubled the cost otherwise — and a publish of fresh media is the common
  // case. Re-copying is safe because the destination key is derived from the
  // rendition's own digest, so the bytes written are identical.
  it("re-copies an existing immutable key rather than probing for it first", async () => {
    const store = new FakeStore();
    store.existingKeys.add(`publication-media/v1/${shaA}/w320.webp`);
    store.existingKeys.add(`publication-media/v1/${shaB}/w640.webp`);
    const { client } = fakeSupabaseWithMedia([readyRow]);

    await resolveInvitationPublicationAssets(client, store, {
      documentAssets: [{ id: assetId, kind: "image" }],
      invitationId,
    });

    expect(store.copies).toHaveLength(2);
    expect(store.heads).toHaveLength(0);
  });

  it("reads every referenced asset in one query scoped to the invitation", async () => {
    const store = new FakeStore();
    const secondAssetId = "4b000000-0000-4000-8000-000000000003";
    const { builder, client } = fakeSupabaseWithMedia([
      readyRow,
      { ...readyRow, id: secondAssetId },
    ]);

    await resolveInvitationPublicationAssets(client, store, {
      documentAssets: [
        { id: assetId, kind: "image" },
        { id: secondAssetId, kind: "image" },
      ],
      invitationId,
    });

    expect(builder.in).toHaveBeenCalledOnce();
    expect(builder.in).toHaveBeenCalledWith("id", [assetId, secondAssetId]);
    expect(builder.eq).toHaveBeenCalledWith("invitation_id", invitationId);
    expect(builder.eq).toHaveBeenCalledWith("status", "ready");
  });

  it("keeps the manifest in document order however the rows came back", async () => {
    const store = new FakeStore();
    const secondAssetId = "4b000000-0000-4000-8000-000000000003";
    const { client } = fakeSupabaseWithMedia([{ ...readyRow, id: secondAssetId }, readyRow]);

    const manifest = await resolveInvitationPublicationAssets(client, store, {
      documentAssets: [
        { id: assetId, kind: "image" },
        { id: secondAssetId, kind: "image" },
      ],
      invitationId,
    });

    expect(manifest.map((entry) => entry.id)).toEqual([assetId, secondAssetId]);
  });

  it("refuses to publish when only some referenced assets are ready", async () => {
    const store = new FakeStore();
    const { client } = fakeSupabaseWithMedia([readyRow]);

    await expect(
      resolveInvitationPublicationAssets(client, store, {
        documentAssets: [
          { id: assetId, kind: "image" },
          { id: "4b000000-0000-4000-8000-000000000003", kind: "image" },
        ],
        invitationId,
      }),
    ).rejects.toBeInstanceOf(PublicationMediaUnavailableError);
  });

  it("fails when a referenced image has no ready media row", async () => {
    const store = new FakeStore();
    const { client } = fakeSupabaseWithMedia([]);

    await expect(
      resolveInvitationPublicationAssets(client, store, {
        documentAssets: [{ id: assetId, kind: "image" }],
        invitationId,
      }),
    ).rejects.toBeInstanceOf(PublicationMediaUnavailableError);
  });

  it("rejects unsupported audio references in this batch", async () => {
    const store = new FakeStore();
    const { client } = fakeSupabaseWithMedia([readyRow]);

    await expect(
      resolveInvitationPublicationAssets(client, store, {
        documentAssets: [{ id: assetId, kind: "audio" }],
        invitationId,
      }),
    ).rejects.toBeInstanceOf(PublicationMediaUnavailableError);
  });
});
