import { z } from "zod";

import {
  applySectionDocumentDetails,
  SectionDocumentSectionError,
  sectionDocumentDetailsSchema,
} from "../../lib/invitations/little-blessings-details";
import type { createClient } from "../../lib/supabase/server";
import {
  InvitationDraftConflictError,
  InvitationDraftPersistenceError,
  loadInvitationDraft,
  saveInvitationSectionsDraft,
  TemplateUnavailableError,
} from "./drafts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const saveSectionDocumentInputSchema = z.strictObject({
  details: sectionDocumentDetailsSchema,
  expectedRevision: z.number().int().positive(),
  invitationId: z.string().uuid(),
});

/**
 * Persists an edit for a template registered to `section-document-v1`. The
 * document is rebuilt and re-parsed before the database repeats ownership,
 * revision, template-policy, visibility, and bounds checks.
 */
export async function saveSectionDocumentDraft(supabase: SupabaseServerClient, input: unknown) {
  const parsed = saveSectionDocumentInputSchema.parse(input);
  const draft = await loadInvitationDraft(supabase, parsed.invitationId);

  if (!draft) {
    throw new InvitationDraftPersistenceError();
  }

  if (draft.manifest.editorKey !== "section-document-v1") {
    throw new TemplateUnavailableError();
  }

  if (draft.revision !== parsed.expectedRevision) {
    throw new InvitationDraftConflictError();
  }

  let updatedDocument: ReturnType<typeof applySectionDocumentDetails>;
  try {
    updatedDocument = applySectionDocumentDetails(draft.document, parsed.details);
  } catch (error: unknown) {
    if (error instanceof SectionDocumentSectionError) {
      throw new InvitationDraftPersistenceError();
    }
    throw error;
  }

  const updatedTypes = new Set(Object.keys(parsed.details));
  const sectionUpdates = updatedDocument.sections
    .filter((section) => updatedTypes.has(section.type))
    .map(({ id, props, visible }) => ({ id, props, visible }));

  if (sectionUpdates.length !== updatedTypes.size) {
    throw new InvitationDraftPersistenceError();
  }

  return saveInvitationSectionsDraft(supabase, {
    expectedRevision: parsed.expectedRevision,
    invitationId: parsed.invitationId,
    sectionUpdates,
  });
}
