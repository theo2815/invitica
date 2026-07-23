import { publicationPublicIdentifierSchema } from "@invitica/invitation-schema";

export function publicIdentifierFromInvitationPath(pathname: string): string | null {
  if (pathname.length > 160) return null;
  const match = pathname.match(/^\/i\/[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?-([0-9a-f]{32})\/?$/);
  const candidate = match?.[1];
  if (!candidate) return null;
  const parsed = publicationPublicIdentifierSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
