import type { User } from "@supabase/supabase-js";

/**
 * How a creator signs in, read from the identities Supabase attaches to the account.
 *
 * Two settings panels depend on this rather than assuming email and password. An account
 * created through Google has no password to re-verify and no address Invitica owns: offering
 * it either form would produce a failure the creator cannot act on — `signInWithPassword`
 * returning "incorrect" for a password that does not exist is the worst of those, because it
 * reads as the creator misremembering.
 */
export interface CreatorIdentity {
  /** True when an email/password identity exists, so a password can be re-verified. */
  hasPassword: boolean;
  /** Sorted, human-readable provider names for the account-facts panel. */
  providerLabels: string[];
}

const providerLabels: Record<string, string> = {
  email: "Email and password",
  google: "Google",
};

export function readCreatorIdentity(user: User): CreatorIdentity {
  // `identities` is the authoritative list; `app_metadata.providers` mirrors it and is kept
  // only as the fallback for a session shape that predates it.
  const providers =
    user.identities?.map((identity) => identity.provider) ??
    (Array.isArray(user.app_metadata?.providers)
      ? (user.app_metadata.providers as string[])
      : ([] as string[]));

  const unique = [...new Set(providers)].sort();

  return {
    hasPassword: unique.includes("email"),
    providerLabels: unique.map((provider) => providerLabels[provider] ?? provider),
  };
}
