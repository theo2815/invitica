import { createHash, randomBytes } from "node:crypto";

import { createAdminClient } from "../../lib/supabase/admin";
import type { createClient } from "../../lib/supabase/server";
import {
  PublishedInvitationPurgeError,
  purgePublishedInvitationObjects,
  readPublishedInvitationObjects,
} from "../invitations/publication-purge";
import { R2MediaObjectStore, readR2MediaConfig } from "../media/object-store";
import { DELETION_LINK_MINUTES } from "./deletion-email";

export { DELETION_LINK_MINUTES };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type DeletionTokenState = "claimed" | "expired" | "unknown" | "used" | "valid";

export class AccountDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

/**
 * 32 bytes of CSPRNG output, base64url. The raw value goes into the emailed link and is never
 * written down anywhere else — the database stores only its SHA-256.
 */
export function createDeletionToken(): { hash: Buffer; token: string } {
  const raw = randomBytes(32);
  return {
    hash: hashDeletionToken(raw.toString("base64url")),
    token: raw.toString("base64url"),
  };
}

export function hashDeletionToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/**
 * Postgres `bytea` over PostgREST is hex with a `\x` prefix; `Buffer` alone serializes to JSON as
 * a byte array and the function rejects it.
 */
function toByteaLiteral(value: Buffer): string {
  return `\\x${value.toString("hex")}`;
}

export async function openDeletionRequest(
  supabase: SupabaseServerClient,
  hash: Buffer,
): Promise<void> {
  const expiresAt = new Date(Date.now() + DELETION_LINK_MINUTES * 60 * 1000).toISOString();
  const { error } = await supabase.rpc("request_account_deletion", {
    p_expires_at: expiresAt,
    p_token_hash: toByteaLiteral(hash),
  });

  if (error) {
    throw new AccountDeletionError("The deletion request could not be opened.");
  }
}

/**
 * Asks what the caller's own request says about this token. `claim` is what makes it single-use,
 * so the page render passes false and the final button passes true.
 */
export async function resolveDeletionToken(
  supabase: SupabaseServerClient,
  token: string,
  claim: boolean,
): Promise<DeletionTokenState> {
  const { data, error } = await supabase.rpc("resolve_account_deletion", {
    p_claim: claim,
    p_token_hash: toByteaLiteral(hashDeletionToken(token)),
  });

  if (error) {
    throw new AccountDeletionError("The deletion link could not be checked.");
  }

  const state = typeof data === "string" ? data : "unknown";
  return state === "claimed" || state === "expired" || state === "used" || state === "valid"
    ? state
    : "unknown";
}

/**
 * What deleting this account would actually cost, so the warning can name it.
 *
 * Both reads run under the creator's own session, so workspace-scoped RLS is what makes the
 * counts theirs. A failed read returns zeroes and the panel falls back to its generic wording
 * rather than refusing to render — the count is there to inform the decision, not to gate it.
 */
export async function readDeletionImpact(
  supabase: SupabaseServerClient,
): Promise<{ published: number; total: number }> {
  const [invitations, aliases] = await Promise.all([
    supabase.from("invitations").select("id", { count: "exact", head: true }),
    supabase.from("publication_aliases").select("invitation_id", { count: "exact", head: true }),
  ]);

  return {
    published: aliases.error ? 0 : (aliases.count ?? 0),
    total: invitations.error ? 0 : (invitations.count ?? 0),
  };
}

/**
 * Takes every published invitation this creator owns off the guest edge, then removes the account.
 *
 * **The R2 objects go first, and that order is the whole point.** The Viewer resolves an
 * invitation entirely from R2 and never reads Postgres, so deleting the account rows alone would
 * leave every shared link serving the event — and its personalized recipients — indefinitely.
 * `0031` settled this for one invitation; an account is the same rule applied to all of them.
 *
 * A failure part-way therefore leaves the account intact with some links already dead, which the
 * creator can retry. The opposite order would leave a deleted account whose invitations are still
 * being opened by guests, with nothing left in the database to find them by.
 *
 * Content-addressed publication media and social previews are deliberately left, for the reason
 * `publication-purge.ts` documents: two invitations carrying identical bytes share one object.
 */
export async function purgeAndDeleteAccount(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.from("invitations").select("id");

  if (error) {
    throw new AccountDeletionError("Your invitations could not be read.");
  }

  const invitationIds = (data ?? [])
    .map((row) => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string");

  if (invitationIds.length > 0) {
    const store = new R2MediaObjectStore(readR2MediaConfig());

    // Sequential on purpose. Fifty parallel R2 deletes against a Philippine mobile connection is
    // not a throughput problem worth having, and a partial failure is easier to reason about when
    // the invitations before it are known to be done.
    for (const invitationId of invitationIds) {
      try {
        const objects = await readPublishedInvitationObjects(supabase, invitationId);
        await purgePublishedInvitationObjects(store, objects);
      } catch (cause) {
        if (cause instanceof PublishedInvitationPurgeError) {
          throw new AccountDeletionError(
            "Some published invitations could not be taken down, so nothing was deleted. Please try again.",
          );
        }
        throw cause;
      }
    }
  }

  // Only now, and only with the service role: deleting `auth.users` is not something a creator's
  // own session can do, and the cascade from that row is what removes the workspace, invitations,
  // guests, replies, saved conversations, and this request itself.
  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    throw new AccountDeletionError("Your account could not be deleted. Please try again.");
  }
}
