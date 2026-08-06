"use server";

import type { InvitationDocument } from "@invitica/invitation-schema";
import type { TemplateRendererKey } from "@invitica/template-kit";
import { z } from "zod";

import {
  type AssistantApiMessage,
  type AssistantConversationSummary,
  assistantMessageSchema,
  MAX_CONVERSATION_TITLE_CHARACTERS,
} from "../../contracts/assistant-api";
import { requireConfirmedUser } from "../auth/session";
import { loadInvitationDraft } from "../invitations/drafts";
import { type CreatorImageAsset, listInvitationImageAssets } from "../media/library";
import {
  deleteAssistantConversation,
  listAssistantConversations,
  loadAssistantConversation,
  saveAssistantConversation,
} from "./conversations";

const invitationSchema = z.strictObject({ invitationId: z.string().uuid() });
const conversationSchema = z.strictObject({ conversationId: z.string().uuid() });

// Forty is the storage ceiling in `save_assistant_conversation`. Rejecting a longer thread
// here means the database is never the first thing to complain about it.
const saveConversationSchema = z.strictObject({
  conversationId: z.union([z.null(), z.string().uuid()]),
  messages: z.array(assistantMessageSchema).min(1).max(40),
  title: z.string().trim().min(1).max(MAX_CONVERSATION_TITLE_CHARACTERS),
});

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

/**
 * The saved-thread actions.
 *
 * All four fail quietly rather than throwing. History is a convenience layered over a
 * conversation that already works without it: a creator whose list cannot load should see
 * an empty list and keep talking to Tala, not an error boundary over the panel they were
 * using.
 */
export async function listAssistantConversationsAction(): Promise<AssistantConversationSummary[]> {
  const { supabase, user } = await requireConfirmedUser();
  return listAssistantConversations(supabase, user.id);
}

export async function loadAssistantConversationAction(
  input: unknown,
): Promise<AssistantApiMessage[] | null> {
  const parsed = conversationSchema.safeParse(input);
  if (!parsed.success) return null;

  const { supabase, user } = await requireConfirmedUser();
  return loadAssistantConversation(supabase, user.id, parsed.data.conversationId);
}

/** Returns the conversation the thread was written to, or null if it was not saved. */
export async function saveAssistantConversationAction(input: unknown): Promise<null | string> {
  const parsed = saveConversationSchema.safeParse(input);
  if (!parsed.success) return null;

  const { supabase } = await requireConfirmedUser();

  return saveAssistantConversation(supabase, {
    conversationId: parsed.data.conversationId,
    messages: parsed.data.messages,
    title: parsed.data.title,
  });
}

export async function deleteAssistantConversationAction(input: unknown): Promise<void> {
  const parsed = conversationSchema.safeParse(input);
  if (!parsed.success) return;

  const { supabase, user } = await requireConfirmedUser();
  await deleteAssistantConversation(supabase, user.id, parsed.data.conversationId);
}
