import { migrateTemplateDocument, resolveTemplateUpgrade } from "@invitica/template-kit";
import { z } from "zod";

import type { createClient } from "../../lib/supabase/server";
import {
  InvitationDraftConflictError,
  InvitationDraftPersistenceError,
  loadInvitationDraft,
} from "./drafts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const upgradeInvitationTemplateInputSchema = z.strictObject({
  currentTemplateVersionId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  invitationId: z.string().uuid(),
  targetTemplateVersionId: z.string().uuid(),
});

export class TemplateUpgradeUnavailableError extends Error {
  constructor() {
    super("This template update is no longer available. Reload the latest draft.");
    this.name = "TemplateUpgradeUnavailableError";
  }
}

/**
 * Applies one declared immutable template-version step. The pure migration and
 * the database RPC both require the new document to equal the old document
 * except for `templateVersionId`; neither layer reapplies template defaults.
 */
export async function upgradeInvitationTemplate(supabase: SupabaseServerClient, input: unknown) {
  const parsed = upgradeInvitationTemplateInputSchema.parse(input);
  const draft = await loadInvitationDraft(supabase, parsed.invitationId);

  if (!draft) {
    throw new InvitationDraftPersistenceError();
  }

  if (draft.revision !== parsed.expectedRevision) {
    throw new InvitationDraftConflictError();
  }

  if (draft.document.templateVersionId !== parsed.currentTemplateVersionId) {
    throw new TemplateUpgradeUnavailableError();
  }

  const upgrade = resolveTemplateUpgrade(draft.document.templateVersionId);
  if (!upgrade || upgrade.templateVersionId !== parsed.targetTemplateVersionId) {
    throw new TemplateUpgradeUnavailableError();
  }

  const document = migrateTemplateDocument(draft.document, upgrade.templateVersionId);
  const { data, error } = await supabase.rpc("upgrade_invitation_template", {
    p_document: document,
    p_expected_revision: parsed.expectedRevision,
    p_from_template_version_id: parsed.currentTemplateVersionId,
    p_invitation_id: parsed.invitationId,
    p_to_template_version_id: upgrade.templateVersionId,
  });

  if (error?.code === "40001") {
    throw new InvitationDraftConflictError();
  }

  if (error?.code === "55000" || error?.code === "23514") {
    throw new TemplateUpgradeUnavailableError();
  }

  if (error) {
    console.error("[Invitation editor] template upgrade failed", {
      code: error.code,
      invitationId: parsed.invitationId,
      message: error.message,
      targetTemplateVersionId: upgrade.templateVersionId,
    });
    throw new InvitationDraftPersistenceError();
  }

  return {
    revision: z.coerce.number().int().positive().parse(data),
    templateVersionId: upgrade.templateVersionId,
  };
}
