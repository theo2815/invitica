import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import type { MediaObjectPutOptions, MediaObjectStore } from "../src/server/media/object-store";
import {
  MediaAuthorizationError,
  MediaConflictError,
  MediaPersistenceError,
  MediaValidationError,
  removeInvitationImage,
  uploadInvitationImage,
} from "../src/server/media/uploads";

const invitationId = "4a000000-0000-4000-8000-000000000001";
const assetId = "4a000000-0000-4000-8000-000000000002";

async function photo(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { background: { b: 40, g: 90, r: 180 }, channels: 3, height: 900, width: 1200 },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buffer);
}

class FakeStore implements MediaObjectStore {
  readonly puts: string[] = [];
  readonly deletes: string[] = [];
  putShouldFail = false;

  async put(key: string, _body: Uint8Array, _options: MediaObjectPutOptions): Promise<void> {
    if (this.putShouldFail) throw new Error("network");
    this.puts.push(key);
  }
  async copy(): Promise<void> {}
  async head(): Promise<boolean> {
    return true;
  }
  async delete(key: string): Promise<void> {
    this.deletes.push(key);
  }
}

function fakeSupabase(result: { data?: unknown; error?: { code?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { client: { rpc } as never, rpc };
}

describe("uploadInvitationImage", () => {
  it("stores objects and records the image through the RPC", async () => {
    const store = new FakeStore();
    const { client, rpc } = fakeSupabase({ data: assetId });

    const result = await uploadInvitationImage(client, store, {
      assetId,
      data: await photo(),
      invitationId,
      role: "hero",
    });

    expect(result).toMatchObject({
      assetId,
      height: 900,
      renditions: [
        { height: 240, width: 320 },
        { height: 480, width: 640 },
        { height: 720, width: 960 },
      ],
      width: 1200,
    });
    expect(store.puts).toContain(`media/originals/v1/${assetId}.jpg`);
    expect(store.puts.some((key) => key.startsWith(`media/renditions/v1/${assetId}/`))).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "record_invitation_image",
      expect.objectContaining({
        p_asset_id: assetId,
        p_invitation_id: invitationId,
        p_original_content_type: "image/jpeg",
        p_role: "hero",
        p_width: 1200,
        p_height: 900,
      }),
    );
    expect(store.deletes).toHaveLength(0);
  });

  it("rejects a non-image upload before touching storage or the database", async () => {
    const store = new FakeStore();
    const { client, rpc } = fakeSupabase({});

    await expect(
      uploadInvitationImage(client, store, {
        assetId,
        data: new Uint8Array([104, 101, 108, 108, 111, 45, 110, 111, 116, 45, 105, 109, 103]),
        invitationId,
        role: "hero",
      }),
    ).rejects.toBeInstanceOf(MediaValidationError);
    expect(store.puts).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps an ownership failure and cleans up written objects", async () => {
    const store = new FakeStore();
    const { client } = fakeSupabase({ error: { code: "P0002" } });

    await expect(
      uploadInvitationImage(client, store, {
        assetId,
        data: await photo(),
        invitationId,
        role: "gallery",
      }),
    ).rejects.toBeInstanceOf(MediaAuthorizationError);
    expect(store.deletes.sort()).toEqual(store.puts.sort());
  });

  it("maps a duplicate asset id to a conflict", async () => {
    const store = new FakeStore();
    const { client } = fakeSupabase({ error: { code: "23505" } });

    await expect(
      uploadInvitationImage(client, store, {
        assetId,
        data: await photo(),
        invitationId,
        role: "gift",
      }),
    ).rejects.toBeInstanceOf(MediaConflictError);
  });

  it("cleans up and fails when object storage rejects a write", async () => {
    const store = new FakeStore();
    store.putShouldFail = true;
    const { client, rpc } = fakeSupabase({});

    await expect(
      uploadInvitationImage(client, store, {
        assetId,
        data: await photo(),
        invitationId,
        role: "hero",
      }),
    ).rejects.toBeInstanceOf(MediaPersistenceError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("removeInvitationImage", () => {
  it("soft deletes through the RPC", async () => {
    const { client, rpc } = fakeSupabase({});
    await removeInvitationImage(client, { assetId });
    expect(rpc).toHaveBeenCalledWith("soft_delete_invitation_image", { p_asset_id: assetId });
  });

  it("maps an ownership failure", async () => {
    const { client } = fakeSupabase({ error: { code: "P0002" } });
    await expect(removeInvitationImage(client, { assetId })).rejects.toBeInstanceOf(
      MediaAuthorizationError,
    );
  });
});
