import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const publicIdentifierSchema = z.string().regex(/^[0-9a-f]{32}$/);

export class GuestViewPersistenceError extends Error {
  constructor() {
    super("The invitation view could not be recorded.");
    this.name = "GuestViewPersistenceError";
  }
}

export async function recordInvitationView(
  supabase: SupabaseClient,
  publicIdentifier: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("record_invitation_view", {
    p_public_identifier: publicIdentifierSchema.parse(publicIdentifier),
  });
  if (error) throw new GuestViewPersistenceError();
  return z.boolean().parse(data);
}
