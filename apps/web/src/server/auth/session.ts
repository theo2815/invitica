import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "../../lib/supabase/server";
import { getPostAuthLegalRedirect } from "../legal/acceptance";

export async function getOptionalConfirmedUser() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email_confirmed_at) {
    return null;
  }

  return { supabase, user };
}

const loadConfirmedUser = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (claimsError || !claims) {
    redirect("/login");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email_confirmed_at) {
    redirect("/auth/signout?reason=confirmation");
  }

  return { supabase, user };
});

const loadAcceptedCreator = cache(async () => {
  const session = await loadConfirmedUser();
  const acceptanceRedirect = await getPostAuthLegalRedirect(session.supabase, session.user.id);

  if (acceptanceRedirect) {
    redirect(acceptanceRedirect);
  }

  return session;
});

interface ConfirmedUserOptions {
  allowMissingLegalAcceptance?: boolean;
}

export async function requireConfirmedUser(options: ConfirmedUserOptions = {}) {
  return options.allowMissingLegalAcceptance ? loadConfirmedUser() : loadAcceptedCreator();
}

/**
 * Authenticates the creator **and** guarantees a personal workspace exists.
 *
 * The RPC is idempotent, so after a creator's first action it spends a round trip to
 * Singapore re-learning a fact the request already implies. Use this only where the
 * workspace must be created (a first draft) or where its id is genuinely needed —
 * a page that queries workspace-scoped rows, for instance.
 *
 * For a mutation or read of an invitation that already exists, prefer
 * `requireConfirmedUser`: every RPC behind those paths is security definer and derives
 * ownership from `auth.uid()` on its own, and the table reads are covered by
 * workspace-scoped RLS, so this call was a gate standing in front of a gate.
 */
export async function ensurePersonalWorkspace(options: ConfirmedUserOptions = {}) {
  const { supabase, user } = await requireConfirmedUser(options);
  const { data: workspaceId, error } = await supabase.rpc("ensure_personal_workspace");

  return { error, supabase, user, workspaceId };
}
