import { z } from "zod";

import {
  type AssistantApiMessage,
  type AssistantConversationSummary,
  MAX_CONVERSATION_TITLE_CHARACTERS,
} from "../../contracts/assistant-api";
import type { createClient } from "../../lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The saved side of the Invi thread, added by migration `0033`.
 *
 * Every function here runs under the creator's own session client, so row-level security
 * is the boundary. The explicit `creator_id` filter beside it is deliberate duplication:
 * a policy is one control, and reading someone else's conversation is exactly the failure
 * that must not depend on a single one.
 *
 * Reads and deletes go straight to the tables. Writes go through
 * `save_assistant_conversation`, which is where the bounds and the retained-thread cap
 * live — see the migration for why that is a function and these are not.
 */

/** Matches the retained cap inside `save_assistant_conversation`. */
const MAX_LISTED_CONVERSATIONS = 30;

const summaryRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  updated_at: z.string(),
});

const threadRowSchema = z.object({
  assistant_conversation_messages: z.array(
    z.object({
      content: z.string().min(1),
      ordinal: z.number().int(),
      role: z.enum(["assistant", "user"]),
    }),
  ),
});

export async function listAssistantConversations(
  supabase: SupabaseServerClient,
  creatorId: string,
): Promise<AssistantConversationSummary[]> {
  const { data, error } = await supabase
    .from("assistant_conversations")
    .select("id, title, updated_at")
    .eq("creator_id", creatorId)
    .order("updated_at", { ascending: false })
    .limit(MAX_LISTED_CONVERSATIONS);

  if (error || !data) return [];

  // Anything that does not parse is dropped rather than repaired. History is advisory —
  // a row this version cannot read is better skipped than rendered half-formed.
  return data.flatMap((row) => {
    const parsed = summaryRowSchema.safeParse(row);
    return parsed.success
      ? [{ id: parsed.data.id, title: parsed.data.title, updatedAt: parsed.data.updated_at }]
      : [];
  });
}

/** Returns null when the conversation does not exist or belongs to someone else. */
export async function loadAssistantConversation(
  supabase: SupabaseServerClient,
  creatorId: string,
  conversationId: string,
): Promise<AssistantApiMessage[] | null> {
  const { data, error } = await supabase
    .from("assistant_conversations")
    .select("assistant_conversation_messages(content, ordinal, role)")
    .eq("id", conversationId)
    .eq("creator_id", creatorId)
    .maybeSingle();

  if (error || !data) return null;

  const parsed = threadRowSchema.safeParse(data);
  if (!parsed.success) return null;

  // Sorted here rather than in the query: the rows are capped at forty by the save
  // function, so the ordering is free, and it keeps the read one round trip.
  return [...parsed.data.assistant_conversation_messages]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((message) => ({ content: message.content, role: message.role }));
}

/**
 * Writes the thread whole and returns the conversation it was written to.
 *
 * Returns null on any failure. Saving history must never interrupt a conversation the
 * creator is having: the thread they can see is the one that matters, and a save that
 * failed costs them a record, not their words.
 */
export async function saveAssistantConversation(
  supabase: SupabaseServerClient,
  input: {
    conversationId: null | string;
    messages: readonly AssistantApiMessage[];
    title: string;
  },
): Promise<null | string> {
  if (input.messages.length === 0) return null;

  const { data, error } = await supabase.rpc("save_assistant_conversation", {
    p_conversation_id: input.conversationId,
    p_messages: input.messages.map((message) => ({
      content: message.content,
      role: message.role,
    })),
    p_title: input.title.slice(0, MAX_CONVERSATION_TITLE_CHARACTERS),
  });

  if (error || typeof data !== "string") return null;
  return data;
}

export async function deleteAssistantConversation(
  supabase: SupabaseServerClient,
  creatorId: string,
  conversationId: string,
): Promise<void> {
  await supabase
    .from("assistant_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("creator_id", creatorId);
}
