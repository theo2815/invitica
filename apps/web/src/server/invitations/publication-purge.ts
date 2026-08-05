import { publicationAliasKey } from "@invitica/invitation-schema";
import { z } from "zod";

import type { createClient } from "../../lib/supabase/server";
import type { MediaObjectStore } from "../media/object-store";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export class PublishedInvitationPurgeError extends Error {
  constructor() {
    super("The published invitation could not be removed from the guest edge.");
    this.name = "PublishedInvitationPurgeError";
  }
}

/**
 * The R2 objects that keep a published invitation reachable by guests. The
 * Viewer never reads Postgres: it resolves `publication-aliases/v1/{id}.json`,
 * then the artifact that alias names. Deleting the database rows alone would
 * leave every shared link serving the event and its personalized recipients
 * indefinitely, so a delete has to remove these first.
 */
export interface PublishedInvitationObjects {
  /** `null` when the invitation was never published, which is the common case. */
  readonly aliasKey: string | null;
  readonly artifactKeys: readonly string[];
}

const aliasRowSchema = z.strictObject({ public_identifier: z.string() });
const buildRowSchema = z.strictObject({ artifact_key: z.string().min(1) });

/**
 * Both selects run under the caller's own credentials, so the owner-only RLS
 * policies from `0005` are the authorization boundary — an invitation belonging
 * to another workspace simply returns nothing to purge.
 */
export async function readPublishedInvitationObjects(
  supabase: SupabaseServerClient,
  invitationId: string,
): Promise<PublishedInvitationObjects> {
  const parsedInvitationId = z.string().uuid().parse(invitationId);

  const [aliases, builds] = await Promise.all([
    supabase
      .from("publication_aliases")
      .select("public_identifier")
      .eq("invitation_id", parsedInvitationId),
    supabase
      .from("publication_builds")
      .select("artifact_key")
      .eq("invitation_id", parsedInvitationId)
      .eq("status", "completed"),
  ]);

  if (aliases.error || builds.error) {
    throw new PublishedInvitationPurgeError();
  }

  const alias = z.array(aliasRowSchema).parse(aliases.data ?? [])[0];

  return {
    aliasKey: alias ? publicationAliasKey(alias.public_identifier) : null,
    artifactKeys: z
      .array(buildRowSchema)
      .parse(builds.data ?? [])
      .map((build) => build.artifact_key),
  };
}

/**
 * Deletes the alias first and alone, because that single object is what makes
 * the guest link resolve. If an artifact delete then fails the link is already
 * dead, and the caller may retry the whole deletion safely — every delete here
 * is idempotent.
 *
 * Deliberately left in place:
 *
 * - `publication-media/v1/{sha256}/w{width}.webp` and `publication-social/v1/
 *   {sha256}.jpg` are content-addressed, so two invitations carrying the same
 *   bytes share one object. Deleting them on one invitation's behalf could blank
 *   the artwork of another creator's live invitation.
 * - Private draft media under `media/originals` and `media/renditions` is
 *   already orphaned by the existing delete path. Widening that belongs to the
 *   media-lifecycle work, not here.
 *
 * Neither is reachable without the artifact that named its digests.
 */
export async function purgePublishedInvitationObjects(
  store: Pick<MediaObjectStore, "delete">,
  objects: PublishedInvitationObjects,
): Promise<void> {
  try {
    if (objects.aliasKey) {
      await store.delete(objects.aliasKey);
    }

    await Promise.all(objects.artifactKeys.map((key) => store.delete(key)));
  } catch {
    throw new PublishedInvitationPurgeError();
  }
}
