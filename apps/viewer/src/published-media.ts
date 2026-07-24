import {
  IMAGE_RENDITION_WIDTHS,
  type PublicationSnapshot,
  publicationMediaObjectKey,
} from "@invitica/invitation-schema";
import type { InvitationImageResolver, ResolvedRendererImage } from "@invitica/renderer";

const MEDIA_PATH_PATTERN = /^\/m\/v1\/([0-9a-f]{64})\/w(\d{3,4})\.webp$/;

export interface MediaObjectRequest {
  readonly objectKey: string;
}

/**
 * Same-origin path a guest page requests for one immutable, content-addressed
 * rendition. It mirrors `publicationMediaObjectKey` so the viewer can reconstruct
 * the storage key without trusting the incoming path.
 */
export function mediaPublicPath(sha256: string, width: number): string {
  return `/m/v1/${sha256}/w${width}.webp`;
}

function isRenditionWidth(width: number): width is (typeof IMAGE_RENDITION_WIDTHS)[number] {
  return (IMAGE_RENDITION_WIDTHS as readonly number[]).includes(width);
}

/**
 * Parses a media request path into its storage key, rejecting anything that is
 * not a lowercase SHA-256 digest paired with an allowlisted rendition width. The
 * strict shape keeps the route from reaching private originals or other keys.
 */
export function parseMediaRequestPath(pathname: string): MediaObjectRequest | null {
  const match = pathname.match(MEDIA_PATH_PATTERN);
  const sha256 = match?.[1];
  const widthText = match?.[2];
  if (!sha256 || !widthText) {
    return null;
  }

  const width = Number(widthText);
  if (!isRenditionWidth(width)) {
    return null;
  }

  return { objectKey: publicationMediaObjectKey(sha256, width) };
}

/**
 * Builds a deterministic renderer image resolver from a publication snapshot's
 * asset manifest. Because it derives purely from the immutable snapshot, the
 * server render and client hydration produce identical `<img>` markup.
 */
export function createSnapshotImageResolver(
  assets: PublicationSnapshot["assets"],
): InvitationImageResolver {
  const byAssetId = new Map<string, ResolvedRendererImage>();

  for (const asset of assets) {
    if (asset.kind !== "image") {
      continue;
    }

    byAssetId.set(asset.id, {
      height: asset.height,
      renditions: asset.renditions.map((rendition) => ({
        height: rendition.height,
        url: mediaPublicPath(rendition.sha256, rendition.width),
        width: rendition.width,
      })),
      width: asset.width,
    });
  }

  return (assetId) => byAssetId.get(assetId) ?? null;
}
