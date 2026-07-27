import { publicationSocialPreviewObjectKey } from "@invitica/invitation-schema";

const SOCIAL_PREVIEW_PATH = /^\/s\/v1\/([0-9a-f]{64})\.jpg$/;

export interface SocialPreviewObjectRequest {
  readonly objectKey: string;
}

export function socialPreviewPublicPath(sha256: string): string {
  return `/s/v1/${sha256}.jpg`;
}

export function parseSocialPreviewRequestPath(pathname: string): SocialPreviewObjectRequest | null {
  const match = SOCIAL_PREVIEW_PATH.exec(pathname);
  return match?.[1] ? { objectKey: publicationSocialPreviewObjectKey(match[1]) } : null;
}
