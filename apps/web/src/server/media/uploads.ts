import { z } from "zod";

import type { createClient } from "../../lib/supabase/server";
import { InvalidImageError, processInvitationImage } from "./image-processing";
import {
  IMMUTABLE_MEDIA_CACHE_CONTROL,
  type MediaObjectStore,
  PRIVATE_MEDIA_CACHE_CONTROL,
} from "./object-store";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const invitationImageRoleSchema = z.enum(["hero", "gallery", "gift"]);
export type InvitationImageRole = z.infer<typeof invitationImageRoleSchema>;

const uploadInputSchema = z.strictObject({
  assetId: z.string().uuid(),
  data: z.instanceof(Uint8Array),
  invitationId: z.string().uuid(),
  role: invitationImageRoleSchema,
});

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export class MediaAuthorizationError extends Error {
  constructor() {
    super("This invitation is not available for media changes.");
    this.name = "MediaAuthorizationError";
  }
}

export class MediaConflictError extends Error {
  constructor() {
    super("This image was already recorded. Refresh and try again.");
    this.name = "MediaConflictError";
  }
}

export class MediaPersistenceError extends Error {
  constructor() {
    super("This image could not be saved. Try again.");
    this.name = "MediaPersistenceError";
  }
}

export interface UploadedInvitationImage {
  readonly assetId: string;
  readonly height: number;
  readonly width: number;
}

/**
 * Processes and stores an owner-supplied invitation image, then records it
 * through the ownership-checked RPC. Objects are written before the record so a
 * successful row always has backing storage; a failed record best-effort removes
 * the just-written objects rather than leaving a referenced-but-missing asset.
 */
export async function uploadInvitationImage(
  supabase: SupabaseServerClient,
  store: MediaObjectStore,
  input: unknown,
): Promise<UploadedInvitationImage> {
  const parsed = uploadInputSchema.parse(input);

  let processed: Awaited<ReturnType<typeof processInvitationImage>>;
  try {
    processed = await processInvitationImage({ assetId: parsed.assetId, data: parsed.data });
  } catch (error) {
    if (error instanceof InvalidImageError) {
      throw new MediaValidationError(error.message);
    }
    throw error;
  }

  const writtenKeys: string[] = [];
  try {
    await store.put(processed.original.objectKey, processed.original.body, {
      cacheControl: PRIVATE_MEDIA_CACHE_CONTROL,
      contentType: processed.original.contentType,
    });
    writtenKeys.push(processed.original.objectKey);

    for (const entry of processed.renditions) {
      await store.put(entry.objectKey, entry.body, {
        cacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL,
        contentType: entry.contentType,
      });
      writtenKeys.push(entry.objectKey);
    }
  } catch {
    await removeObjectsBestEffort(store, writtenKeys);
    throw new MediaPersistenceError();
  }

  const { error } = await supabase.rpc("record_invitation_image", {
    p_asset_id: parsed.assetId,
    p_height: processed.asset.height,
    p_invitation_id: parsed.invitationId,
    p_original_byte_length: processed.asset.originalByteLength,
    p_original_content_type: processed.asset.originalContentType,
    p_original_object_key: processed.original.objectKey,
    p_original_sha256: processed.asset.originalSha256,
    p_renditions: processed.asset.renditions,
    p_role: parsed.role,
    p_width: processed.asset.width,
  });

  if (error) {
    await removeObjectsBestEffort(store, writtenKeys);
    if (error.code === "P0002") throw new MediaAuthorizationError();
    if (error.code === "23505") throw new MediaConflictError();
    throw new MediaPersistenceError();
  }

  return {
    assetId: parsed.assetId,
    height: processed.asset.height,
    width: processed.asset.width,
  };
}

const removeInputSchema = z.strictObject({ assetId: z.string().uuid() });

/**
 * Owner-authorized soft delete. Private originals and immutable published
 * renditions are intentionally retained; provider object cleanup is a separate
 * authorized lifecycle action.
 */
export async function removeInvitationImage(
  supabase: SupabaseServerClient,
  input: unknown,
): Promise<void> {
  const parsed = removeInputSchema.parse(input);
  const { error } = await supabase.rpc("soft_delete_invitation_image", {
    p_asset_id: parsed.assetId,
  });

  if (error) {
    if (error.code === "P0002") throw new MediaAuthorizationError();
    throw new MediaPersistenceError();
  }
}

async function removeObjectsBestEffort(store: MediaObjectStore, keys: string[]): Promise<void> {
  await Promise.all(
    keys.map(async (key) => {
      try {
        await store.delete(key);
      } catch {
        // Orphan cleanup is best effort; a lingering private object is not
        // reachable without a recorded, owner-visible media row.
      }
    }),
  );
}
