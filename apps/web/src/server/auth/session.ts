import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";

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

export async function requireConfirmedUser() {
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
}

export async function ensurePersonalWorkspace() {
  const { supabase, user } = await requireConfirmedUser();
  const { data: workspaceId, error } = await supabase.rpc("ensure_personal_workspace");

  return { error, supabase, user, workspaceId };
}
