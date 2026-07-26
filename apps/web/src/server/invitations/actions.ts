"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ensurePersonalWorkspace, requireConfirmedUser } from "../auth/session";
import {
  createInitialInvitationDraft,
  deleteUnpublishedInvitation,
  InvitationDeletionUnavailableError,
  InvitationDraftConflictError,
  InvitationDraftPersistenceError,
  saveGardenPromiseDraft,
  saveGardenPromiseInputSchema,
  TemplateUnavailableError,
} from "./drafts";
import { saveLittleBlessingsDraft, saveLittleBlessingsInputSchema } from "./little-blessings";
import { enqueueInvitationPublication, PublicationEnqueueError } from "./publication-jobs";
import {
  type InvitationPublicationStatus,
  loadInvitationPublicationStatus,
  PublicationAssetsUnavailableError,
  PublicationPersistenceError,
  requestInvitationPublication,
} from "./publications";
import {
  TemplateUpgradeUnavailableError,
  upgradeInvitationTemplate,
  upgradeInvitationTemplateInputSchema,
} from "./template-upgrades";

const createInvitationFormSchema = z.strictObject({
  invitationId: z.string().uuid(),
  templateVersionId: z.string().uuid(),
});

const publicationActionSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  invitationId: z.string().uuid(),
});

const publicationStatusActionSchema = z.strictObject({ invitationId: z.string().uuid() });
const deleteInvitationActionSchema = z.strictObject({ invitationId: z.string().uuid() });

export interface CreateInvitationActionState {
  error: string | null;
}

/**
 * `retryable` marks a failure the server knows wrote nothing, so the editor may send
 * the same revision-guarded request again. Validation and conflict failures are never
 * retryable, and a request that failed in transit is not described here at all —
 * the client cannot know whether it was applied, so it does not retry on its own.
 */
export type UpgradeInvitationTemplateActionResult =
  | { revision: number; status: "updated"; templateVersionId: string }
  | { message: string; status: "conflict" | "error" };

export type SaveGardenPromiseActionResult =
  | { revision: number; status: "saved" }
  | { message: string; retryable?: boolean; status: "conflict" | "error" };

export type SaveLittleBlessingsActionResult =
  | { revision: number; status: "saved" }
  | { message: string; retryable?: boolean; status: "conflict" | "error" };

export type PublishInvitationActionResult =
  | { publicationId: string; status: "accepted" }
  | { message: string; status: "conflict" | "error" };

export type LoadInvitationPublicationStatusActionResult =
  | { publication: InvitationPublicationStatus; status: "loaded" }
  | { message: string; status: "error" };

export type DeleteInvitationActionResult =
  | { status: "deleted" }
  | { message: string; status: "error" };

export async function deleteInvitationAction(
  input: unknown,
): Promise<DeleteInvitationActionResult> {
  const parsed = deleteInvitationActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      message: "This deletion request is no longer valid. Refresh and try again.",
      status: "error",
    };
  }

  const { supabase } = await requireConfirmedUser();

  try {
    await deleteUnpublishedInvitation(supabase, parsed.data.invitationId);
    revalidatePath("/dashboard/invitations");
    return { status: "deleted" };
  } catch (error: unknown) {
    if (error instanceof InvitationDeletionUnavailableError) {
      return { message: error.message, status: "error" };
    }
    return { message: "This invitation could not be deleted. Try again.", status: "error" };
  }
}

export async function createInvitationDraftAction(
  _state: CreateInvitationActionState,
  formData: FormData,
): Promise<CreateInvitationActionState> {
  const input = createInvitationFormSchema.safeParse({
    invitationId: formData.get("invitationId"),
    templateVersionId: formData.get("templateVersionId"),
  });

  if (!input.success) {
    return { error: "This invitation request is no longer valid. Refresh and try again." };
  }

  const { error: workspaceError, supabase, workspaceId } = await ensurePersonalWorkspace();

  if (workspaceError || !workspaceId) {
    return { error: "Your workspace is unavailable. Refresh the page and try again." };
  }

  let invitationId: string;

  try {
    invitationId = await createInitialInvitationDraft(supabase, input.data);
  } catch (error: unknown) {
    if (error instanceof TemplateUnavailableError) {
      return { error: error.message };
    }

    if (error instanceof InvitationDraftPersistenceError) {
      return { error: "Your draft could not be created. Please try again." };
    }

    return { error: "This invitation request could not be completed." };
  }

  redirect(`/dashboard/invitations/${invitationId}`);
}

/**
 * A failed save was previously indistinguishable from any other: every branch
 * discarded the error and answered with prose. These records carry the branch that
 * was taken and the invitation it concerned — never document content, guest data, or
 * anything a creator typed — so a report of "it did not save" can be diagnosed.
 */
function logSaveFailure(
  template: "garden-promise" | "little-blessings",
  reason: string,
  invitationId: string | null,
  error?: unknown,
): void {
  console.error("[Invitation editor] draft save failed", {
    invitationId: invitationId ?? undefined,
    reason,
    template,
    ...(error instanceof Error ? { errorName: error.name } : {}),
  });
}

export async function saveGardenPromiseAction(
  input: unknown,
): Promise<SaveGardenPromiseActionResult> {
  const parsed = saveGardenPromiseInputSchema.safeParse(input);

  if (!parsed.success) {
    logSaveFailure("garden-promise", "invalid_payload", null);
    return { message: "Check the highlighted invitation details and try again.", status: "error" };
  }

  const { supabase } = await requireConfirmedUser();

  try {
    const revision = await saveGardenPromiseDraft(supabase, parsed.data);
    return { revision, status: "saved" };
  } catch (error: unknown) {
    const invitationId = parsed.data.invitationId;

    if (error instanceof InvitationDraftConflictError) {
      logSaveFailure("garden-promise", "revision_conflict", invitationId);
      return {
        message: "This draft changed in another session. Reload the latest version before saving.",
        status: "conflict",
      };
    }

    if (error instanceof InvitationDraftPersistenceError) {
      logSaveFailure("garden-promise", "persistence_failed", invitationId);
      return {
        message: "Your latest changes could not be saved. Try again.",
        retryable: true,
        status: "error",
      };
    }

    logSaveFailure("garden-promise", "unexpected", invitationId, error);
    return {
      message: "This invitation update could not be completed.",
      retryable: true,
      status: "error",
    };
  }
}

export async function saveLittleBlessingsAction(
  input: unknown,
): Promise<SaveLittleBlessingsActionResult> {
  const parsed = saveLittleBlessingsInputSchema.safeParse(input);

  if (!parsed.success) {
    logSaveFailure("little-blessings", "invalid_payload", null);
    return { message: "Check the highlighted invitation details and try again.", status: "error" };
  }

  const { supabase } = await requireConfirmedUser();

  try {
    const revision = await saveLittleBlessingsDraft(supabase, parsed.data);
    return { revision, status: "saved" };
  } catch (error: unknown) {
    const invitationId = parsed.data.invitationId;

    if (error instanceof InvitationDraftConflictError) {
      logSaveFailure("little-blessings", "revision_conflict", invitationId);
      return {
        message: "This draft changed in another session. Reload the latest version before saving.",
        status: "conflict",
      };
    }

    if (error instanceof TemplateUnavailableError) {
      logSaveFailure("little-blessings", "template_unavailable", invitationId);
      return { message: error.message, status: "error" };
    }

    if (error instanceof InvitationDraftPersistenceError) {
      logSaveFailure("little-blessings", "persistence_failed", invitationId);
      return {
        message: "Your latest changes could not be saved. Try again.",
        retryable: true,
        status: "error",
      };
    }

    logSaveFailure("little-blessings", "unexpected", invitationId, error);
    return {
      message: "This invitation update could not be completed.",
      retryable: true,
      status: "error",
    };
  }
}

export async function upgradeInvitationTemplateAction(
  input: unknown,
): Promise<UpgradeInvitationTemplateActionResult> {
  const parsed = upgradeInvitationTemplateInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      message: "This template update request is no longer valid. Refresh and try again.",
      status: "error",
    };
  }

  const { supabase } = await requireConfirmedUser();

  try {
    const result = await upgradeInvitationTemplate(supabase, parsed.data);
    revalidatePath(`/dashboard/invitations/${parsed.data.invitationId}`);
    return { ...result, status: "updated" };
  } catch (error: unknown) {
    if (error instanceof InvitationDraftConflictError) {
      return {
        message: "This draft changed in another session. Reload before updating the template.",
        status: "conflict",
      };
    }

    if (error instanceof TemplateUpgradeUnavailableError) {
      return { message: error.message, status: "error" };
    }

    if (error instanceof InvitationDraftPersistenceError) {
      return {
        message: "The template could not be updated. Your saved draft is unchanged.",
        status: "error",
      };
    }

    return {
      message: "This template update could not be completed.",
      status: "error",
    };
  }
}

export async function publishInvitationAction(
  input: unknown,
): Promise<PublishInvitationActionResult> {
  const parsed = publicationActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      message: "This publication request is no longer valid. Refresh and try again.",
      status: "error",
    };
  }

  const { supabase } = await requireConfirmedUser();

  try {
    const publication = await requestInvitationPublication(supabase, parsed.data);
    await enqueueInvitationPublication(publication.publicationId, parsed.data.idempotencyKey);
    return { publicationId: publication.publicationId, status: "accepted" };
  } catch (error: unknown) {
    if (error instanceof InvitationDraftConflictError) {
      return {
        message: "This draft changed before publishing. Reload the latest version and try again.",
        status: "conflict",
      };
    }
    if (
      error instanceof PublicationAssetsUnavailableError ||
      error instanceof TemplateUnavailableError
    ) {
      return { message: error.message, status: "error" };
    }
    if (error instanceof PublicationEnqueueError) {
      return {
        message: "The publication was saved, but delivery could not start. Try publishing again.",
        status: "error",
      };
    }
    if (
      error instanceof PublicationPersistenceError ||
      error instanceof InvitationDraftPersistenceError
    ) {
      return {
        message: "This invitation could not be prepared for publishing. Try again.",
        status: "error",
      };
    }
    return { message: "This publication request could not be completed.", status: "error" };
  }
}

export async function loadInvitationPublicationStatusAction(
  input: unknown,
): Promise<LoadInvitationPublicationStatusActionResult> {
  const parsed = publicationStatusActionSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "This publication status request is no longer valid.", status: "error" };
  }

  const { supabase } = await requireConfirmedUser();

  try {
    return {
      publication: await loadInvitationPublicationStatus(supabase, parsed.data.invitationId),
      status: "loaded",
    };
  } catch {
    return { message: "Publication status could not be refreshed. Try again.", status: "error" };
  }
}
