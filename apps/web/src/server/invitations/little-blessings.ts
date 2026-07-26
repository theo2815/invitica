import { z } from "zod";

import {
  applyLittleBlessingsDetails,
  LITTLE_BLESSINGS_TEMPLATE_VERSION_ID,
  LittleBlessingsSectionError,
  littleBlessingsDetailsSchema,
} from "../../lib/invitations/little-blessings-details";
import type { createClient } from "../../lib/supabase/server";
import {
  InvitationDraftConflictError,
  InvitationDraftPersistenceError,
  loadInvitationDraft,
  TemplateUnavailableError,
} from "./drafts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const saveLittleBlessingsInputSchema = z.strictObject({
  details: littleBlessingsDetailsSchema,
  expectedRevision: z.number().int().positive(),
  invitationId: z.string().uuid(),
});

/**
 * Persists a Little Blessings edit through the bounded `0016` RPC. The document
 * is rebuilt and re-parsed first, so an edit that would produce an invalid
 * invitation is rejected before anything is written; the database repeats the
 * ownership, revision, template, visibility, and bounds checks independently.
 */
export async function saveLittleBlessingsDraft(supabase: SupabaseServerClient, input: unknown) {
  const parsed = saveLittleBlessingsInputSchema.parse(input);
  const draft = await loadInvitationDraft(supabase, parsed.invitationId);

  if (!draft) {
    throw new InvitationDraftPersistenceError();
  }

  if (draft.document.templateVersionId !== LITTLE_BLESSINGS_TEMPLATE_VERSION_ID) {
    throw new TemplateUnavailableError();
  }

  if (draft.revision !== parsed.expectedRevision) {
    throw new InvitationDraftConflictError();
  }

  try {
    applyLittleBlessingsDetails(draft.document, parsed.details);
  } catch (error: unknown) {
    if (error instanceof LittleBlessingsSectionError) {
      throw new InvitationDraftPersistenceError();
    }
    throw error;
  }

  const { data, error } = await supabase.rpc("update_little_blessings_details", {
    p_details: parsed.details,
    p_expected_revision: parsed.expectedRevision,
    p_invitation_id: parsed.invitationId,
  });

  if (error?.code === "40001") {
    throw new InvitationDraftConflictError();
  }

  if (error) {
    // The PostgreSQL code and message are the only things that separate a missing
    // migration from an RLS denial from a bound violation. Discarding them made
    // every save failure look identical from the server logs.
    console.error("[Invitation editor] update_little_blessings_details failed", {
      code: error.code,
      details: error.details || undefined,
      hint: error.hint || undefined,
      invitationId: parsed.invitationId,
      message: error.message,
    });
    throw new InvitationDraftPersistenceError();
  }

  return z.coerce.number().int().positive().parse(data);
}
