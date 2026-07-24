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
 * Builds the immutable publication asset manifest for a draft's document
 * assets. Each ready rendition is copied to a content-addressed publication key
 * (idempotently, skipping keys that already exist), so the snapshot can never be
 * mutated by a later draft edit and republishing identical media does no work.
 */
export async function resolveInvitationPublicationAssets(
  supabase: SupabaseServerClient,
  store: MediaObjectStore,
  input: {
    readonly invitationId: string;
    readonly documentAssets: InvitationDocument["assets"];
  },
): Promise<PublicationAssetManifestEntry[]> {
  const manifest: PublicationAssetManifestEntry[] = [];

  for (const asset of input.documentAssets) {
    if (asset.kind !== "image") {
      // Audio media is not part of this batch; a referenced audio asset cannot
      // be resolved to viewer-safe storage yet.
      throw new PublicationMediaUnavailableError();
    }

    const { data, error } = await supabase
      .from("invitation_media_assets")
      .select("id, width, height, renditions")
      .eq("id", asset.id)
      .eq("invitation_id", input.invitationId)
      .eq("status", "ready")
      .maybeSingle();

    if (error || !data) {
      throw new PublicationMediaUnavailableError();
    }

    const media = storedMediaSchema.parse(data);
    const renditions = [];
    for (const rendition of media.renditions) {
      const destinationKey = publicationMediaObjectKey(rendition.sha256, rendition.width);
      if (!(await store.head(destinationKey))) {
        await store.copy(mediaRenditionObjectKey(media.id, rendition.width), destinationKey, {
          cacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL,
          contentType: DELIVERED_IMAGE_CONTENT_TYPE,
        });
      }
      renditions.push({
        byteLength: rendition.byteLength,
        height: rendition.height,
        objectKey: destinationKey,
        sha256: rendition.sha256,
        width: rendition.width,
      });
    }

    manifest.push({
      contentType: DELIVERED_IMAGE_CONTENT_TYPE,
      height: media.height,
      id: media.id,
      kind: "image",
      renditions,
      width: media.width,
    });
  }

  return manifest;
}
