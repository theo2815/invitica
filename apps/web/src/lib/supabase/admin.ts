import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./config";

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("The Supabase service role is not configured for private guest resolution.");
  }

  const { url } = getSupabaseConfig();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
