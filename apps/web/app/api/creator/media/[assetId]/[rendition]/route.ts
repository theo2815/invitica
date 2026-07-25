import {
  DELIVERED_IMAGE_CONTENT_TYPE,
  mediaRenditionObjectKey,
  mediaRenditionSchema,
} from "@invitica/invitation-schema";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalConfirmedUser } from "../../../../../../src/server/auth/session";
import {
  R2MediaObjectStore,
  readR2MediaConfig,
} from "../../../../../../src/server/media/object-store";

/**
 * Streams one private draft rendition to the creator who owns it, so the
 * invitation editor can show real thumbnails and a truthful shared-renderer
 * preview of uploaded photographs.
 *
 * Guests never use this route. Published invitations read immutable
 * content-addressed media from the Viewer's `/m/v1/...` route instead, and
 * these draft objects stay private in R2. Baby photographs are sensitive family
 * media, so every response is `private, no-store` and every failure — missing,
 * not yet processed, or belonging to another workspace — is the same bare 404.
 */

const assetIdSchema = z.string().uuid();
const renditionSchema = z.string().regex(/^w(\d{1,4})\.webp$/);
const storedAssetSchema = z.strictObject({
  renditions: z.array(mediaRenditionSchema).min(1).max(4),
});

const failureHeaders = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function notFound() {
  return new NextResponse(null, { headers: failureHeaders, status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string; rendition: string }> },
) {
  const { assetId, rendition } = await params;
  const parsedAssetId = assetIdSchema.safeParse(assetId);
  const parsedRendition = renditionSchema.safeParse(rendition);
  if (!parsedAssetId.success || !parsedRendition.success) return notFound();

  const width = Number(parsedRendition.data.slice(1, -".webp".length));

  const session = await getOptionalConfirmedUser();
  if (!session) return notFound();

  // The owner-scoped RLS policy on `invitation_media_assets` is the
  // authorization boundary: another workspace's asset simply does not exist.
  const { data, error } = await session.supabase
    .from("invitation_media_assets")
    .select("renditions")
    .eq("id", parsedAssetId.data)
    .eq("status", "ready")
    .maybeSingle();

  if (error || !data) return notFound();

  const asset = storedAssetSchema.safeParse(data);
  if (!asset.success) return notFound();
  if (!asset.data.renditions.some((entry) => entry.width === width)) return notFound();

  let body: Uint8Array | null;
  try {
    const store = new R2MediaObjectStore(readR2MediaConfig());
    body = await store.get(mediaRenditionObjectKey(parsedAssetId.data, width));
  } catch {
    return notFound();
  }

  if (!body) return notFound();

  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...failureHeaders,
      "content-length": String(body.byteLength),
      "content-type": DELIVERED_IMAGE_CONTENT_TYPE,
    },
    status: 200,
  });
}
