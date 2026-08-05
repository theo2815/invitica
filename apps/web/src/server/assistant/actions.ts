"use server";

import type { InvitationDocument } from "@invitica/invitation-schema";
import type { TemplateRendererKey } from "@invitica/template-kit";
import { z } from "zod";

import { requireConfirmedUser } from "../auth/session";
import { loadInvitationDraft } from "../invitations/drafts";
import { type CreatorImageAsset, listInvitationImageAssets } from "../media/library";

const invitationSchema = z.strictObject({ invitationId: z.string().uuid() });

export type LoadAssistantInvitationResult =
  | {
      assets: readonly CreatorImageAsset[];
      document: InvitationDocument;
      rendererKey: TemplateRendererKey;
      revision: number;
      status: "loaded";
    }
  | { message: string; status: "error" };

/**
 * Loads one invitation so `/dashboard/assistant` can preview a draft against it.
 *
 * The page has no editor to borrow a preview from, so it renders its own — and a preview
 * that stands in for the editor's has to be the editor's, not a likeness of it. That means
 * the same renderer, the same document, and the same uploaded photographs; without the
 * assets the page would quietly show placeholders where the editor shows a creator's
 * portrait, and the two surfaces would disagree about the same invitation.
 *
 * Reads only. Nothing on the assistant path writes, and this is no exception.
 */
export async function loadAssistantInvitationAction(
  input: unknown,
): Promise<LoadAssistantInvitationResult> {
  const parsed = invitationSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "That invitation request is no longer valid.", status: "error" };
  }

  const { supabase } = await requireConfirmedUser();

  try {
    const draft = await loadInvitationDraft(supabase, parsed.data.invitationId);
    if (!draft) {
      return { message: "That invitation is no longer available.", status: "error" };
    }

    return {
      assets: await listInvitationImageAssets(supabase, draft.invitationId),
      document: draft.document,
      rendererKey: draft.manifest.rendererKey,
      revision: draft.revision,
      status: "loaded",
    };
  } catch {
    return {
      message: "That invitation could not be opened. Try again in a moment.",
      status: "error",
    };
  }
}
