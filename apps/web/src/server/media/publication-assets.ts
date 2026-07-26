import {
  DELIVERED_IMAGE_CONTENT_TYPE,
  type InvitationDocument,
  mediaRenditionObjectKey,
  mediaRenditionSchema,
  type PublicationAssetManifestEntry,
  publicationMediaObjectKey,
} from "@invitica/invitation-schema";
import { z } from "zod";

import type { createClient } from "../../lib/supabase/server";
import { IMMUTABLE_MEDIA_CACHE_CONTROL, type MediaObjectStore } from "./object-store";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export class PublicationMediaUnavailableError extends Error {
  constructor() {
    super("This invitation has unresolved media and cannot be published yet.");
    this.name = "PublicationMediaUnavailableError";
  }
}

const storedMediaSchema = z.strictObject({
  id: z.string().uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  renditions: z.array(mediaRenditionSchema).min(1).max(4),
});

/**
 * Bounded so a seventeen-photograph invitation issues a few short bursts to R2 rather
 * than sixty-eight requests at once.
 */
const RENDITION_COPY_CONCURRENCY = 8;

async function inBatches<T>(tasks: readonly (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = [];
  for (let index = 0; index < tasks.length; index += size) {
    results.push(...(await Promise.all(tasks.slice(index, index + size).map((task) => task()))));
  }
  return results;
}

/**
 * Builds the immutable publication asset manifest for a draft's document assets. Each
 * ready rendition is copied to a content-addressed publication key, so the snapshot can
 * never be mutated by a later draft edit.
 *
 * This runs inside the publish request, before the snapshot row exists, because `0017`
 * validates the manifest at insert. It used to do so strictly sequentially: one query
 * per asset, then a HEAD and a COPY per rendition, each awaited alone. A Little
 * Blessings invitation may carry seventeen images of up to four renditions, so a single
 * publish could spend more than 150 consecutive round trips to Singapore — tens of
 * seconds before the job was even enqueued.
 *
 * Two changes, no behaviour lost:
 *
 * - **One query for every asset** instead of one per asset. Ownership is unchanged: the
 *   filter still pins `invitation_id`, so an id belonging to another invitation is
 *   simply absent, and a missing row is still refused.
 * - **No HEAD before COPY.** Both cost one request, so the probe only ever saved work
 *   when the key already existed and doubled it otherwise. The destination key is
 *   derived from the rendition's own digest, so re-copying writes byte-identical
 *   content and cannot disturb a snapshot already pointing at it.
 */
export async function resolveInvitationPublicationAssets(
  supabase: SupabaseServerClient,
  store: MediaObjectStore,
  input: {
    readonly invitationId: string;
    readonly documentAssets: InvitationDocument["assets"];
  },
): Promise<PublicationAssetManifestEntry[]> {
  if (input.documentAssets.length === 0) return [];

  for (const asset of input.documentAssets) {
    if (asset.kind !== "image") {
      // Audio media is not part of this batch; a referenced audio asset cannot
      // be resolved to viewer-safe storage yet.
      throw new PublicationMediaUnavailableError();
    }
  }

  const { data, error } = await supabase
    .from("invitation_media_assets")
    .select("id, width, height, renditions")
    .eq("invitation_id", input.invitationId)
    .eq("status", "ready")
    .in(
      "id",
      input.documentAssets.map((asset) => asset.id),
    );

  if (error) throw new PublicationMediaUnavailableError();
  const readyMedia = new Map(
    z
      .array(storedMediaSchema)
      .parse(data ?? [])
      .map((media) => [media.id, media] as const),
  );

  // Resolved in document order so the manifest is deterministic regardless of the
  // order the database returned rows or the copies completed in.
  const ordered = input.documentAssets.map((asset) => {
    const media = readyMedia.get(asset.id);
    if (!media) throw new PublicationMediaUnavailableError();
    return media;
  });

  const copies = ordered.flatMap((media) =>
    media.renditions.map(
      (rendition) => () =>
        store.copy(
          mediaRenditionObjectKey(media.id, rendition.width),
          publicationMediaObjectKey(rendition.sha256, rendition.width),
          {
            cacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL,
            contentType: DELIVERED_IMAGE_CONTENT_TYPE,
          },
        ),
    ),
  );
  await inBatches(copies, RENDITION_COPY_CONCURRENCY);

  return ordered.map((media) => ({
    contentType: DELIVERED_IMAGE_CONTENT_TYPE,
    height: media.height,
    id: media.id,
    kind: "image",
    renditions: media.renditions.map((rendition) => ({
      byteLength: rendition.byteLength,
      height: rendition.height,
      objectKey: publicationMediaObjectKey(rendition.sha256, rendition.width),
      sha256: rendition.sha256,
      width: rendition.width,
    })),
    width: media.width,
  }));
}
