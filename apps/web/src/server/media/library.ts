import { mediaRenditionSchema } from "@invitica/invitation-schema";
import { z } from "zod";

import type { createClient } from "../../lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const storedAssetSchema = z.strictObject({
  id: z.string().uuid(),
  role: z.enum(["hero", "gallery", "gift"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  renditions: z.array(mediaRenditionSchema).min(1).max(4),
});

export interface CreatorImageRendition {
  readonly width: number;
  readonly height: number;
  readonly url: string;
}

/**
 * One of the creator's own draft images, described the way the shared renderer
 * and the editor thumbnails both need it. Renditions carry route URLs rather
 * than object keys: the underlying R2 objects are private and are only ever
 * reached through the owner-authorized media route.
 */
export interface CreatorImageAsset {
  readonly id: string;
  readonly role: "gallery" | "gift" | "hero";
  readonly width: number;
  readonly height: number;
  readonly renditions: readonly CreatorImageRendition[];
}

/** The owner-only route that streams one private draft rendition. */
export function creatorMediaUrl(assetId: string, width: number): string {
  return `/api/creator/media/${assetId}/w${width}.webp`;
}

/**
 * Lists the invitation's ready images. The select is owner-scoped by the
 * `invitation_media_assets` RLS policy from migration `0015`, so a creator can
 * only ever read their own workspace's media.
 */
export async function listInvitationImageAssets(
  supabase: SupabaseServerClient,
  invitationId: string,
): Promise<CreatorImageAsset[]> {
  const { data, error } = await supabase
    .from("invitation_media_assets")
    .select("id, role, width, height, renditions")
    .eq("invitation_id", z.string().uuid().parse(invitationId))
    .eq("status", "ready")
    .order("created_at", { ascending: true });

  if (error) {
    // Missing thumbnails must never take the editor down; the renderer's
    // pending-upload placeholder is the honest fallback.
    return [];
  }

  return z
    .array(storedAssetSchema)
    .parse(data ?? [])
    .map((asset) => ({
      height: asset.height,
      id: asset.id,
      renditions: asset.renditions
        .map((rendition) => ({
          height: rendition.height,
          url: creatorMediaUrl(asset.id, rendition.width),
          width: rendition.width,
        }))
        .sort((first, second) => first.width - second.width),
      role: asset.role,
      width: asset.width,
    }));
}
