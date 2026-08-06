import { z } from "zod";

/**
 * Bounds on what one turn may cost, checked before the model is reached.
 *
 * The daily cap limits how many messages a creator sends; these limit how large any one of
 * them can be. Without them a single pasted wall of text, or a thread left open all
 * afternoon, would cost several times what the cap was sized for.
 *
 * They live in the contract rather than beside the system prompt because the composer needs
 * them too, and importing the prompt module into a client component would ship the entire
 * help corpus to the browser.
 */
export const MAX_MESSAGE_CHARACTERS = 2_000;
export const MAX_CONVERSATION_MESSAGES = 20;

export const assistantMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_CHARACTERS),
  role: z.enum(["assistant", "user"]),
});

// A thread that does not end with the creator has nothing to answer. Rejecting it here
// keeps a malformed client from spending a message on an empty turn.
const conversationSchema = z
  .array(assistantMessageSchema)
  .min(1)
  .max(MAX_CONVERSATION_MESSAGES)
  .refine((messages) => messages.at(-1)?.role === "user", {
    message: "The last message must come from the creator.",
  });

export const assistantRequestSchema = z.object({ messages: conversationSchema });

/**
 * A document proposal is asked for against one invitation, named by id rather than sent as
 * a document. The server loads the draft itself under the creator's own session, so a
 * client cannot ask the assistant to rewrite an invitation it does not own, and cannot
 * describe someone else's draft as the starting point.
 */
export const assistantDocumentRequestSchema = z.object({
  invitationId: z.string().uuid(),
  messages: conversationSchema,
});

/**
 * A guest-list parse is asked for against one invitation, the same way a document proposal
 * is. Guest parties belong to a published invitation, so the server resolves the invitation
 * under the creator's own session and refuses one they do not own or have not published.
 *
 * It carries a conversation rather than a single paste, because correcting a parse is a
 * sentence — "the Santos family is six, not five" — and re-pasting the whole list to fix one
 * row would be worse than typing it.
 */
export const assistantGuestsRequestSchema = z.object({
  invitationId: z.string().uuid(),
  messages: conversationSchema,
});

/**
 * How many parties one request may produce.
 *
 * `createGuestPartiesAction` accepts at most 50 in a single transaction and the composer
 * holds 50 rows, so a longer answer could not be created anyway. Truncating here gives a
 * creator fifty rows they can act on instead of a refusal they cannot.
 */
export const MAX_PARSED_GUEST_PARTIES = 50;

/**
 * One parsed party, in the shape `createGuestPartiesAction` already accepts.
 *
 * Declared in the contract rather than beside the parser so the composer can hold these
 * without importing server code. The server still validates every one of them against
 * `guestPartyInputSchema` before it is sent — this type describes what survived, not what
 * the model said.
 */
export interface ParsedGuestParty {
  capacity: number;
  guestNames: string[];
  internalLabel: string;
  recipientName: string;
}

/**
 * How a saved thread appears in the history list.
 *
 * Deliberately not the messages. Opening the list must not pull every word a creator has
 * ever written to Tala into the browser; the thread itself is loaded when one is chosen.
 */
export interface AssistantConversationSummary {
  id: string;
  title: string;
  /** ISO 8601, as the database returns it. */
  updatedAt: string;
}

/** Matches `assistant_conversations_title_bounds` in migration `0033`. */
export const MAX_CONVERSATION_TITLE_CHARACTERS = 120;

/**
 * Names a thread from the creator's own first question.
 *
 * Invitica writes this, not the model. A title is not worth a billed call, and a
 * model-written one would be a second place a creator's words could be quietly reworded.
 */
export function conversationTitle(messages: readonly AssistantApiMessage[]): string {
  const first = messages.find((message) => message.role === "user")?.content ?? "";
  const collapsed = first.replace(/\s+/g, " ").trim();

  if (collapsed.length === 0) return "Untitled conversation";
  if (collapsed.length <= MAX_CONVERSATION_TITLE_CHARACTERS) return collapsed;

  // An ellipsis rather than a hard cut, so a truncated title reads as truncated instead
  // of as a creator who stopped mid-word.
  return `${collapsed.slice(0, MAX_CONVERSATION_TITLE_CHARACTERS - 1).trimEnd()}…`;
}

/**
 * The tail of a thread that is small enough to send.
 *
 * A saved conversation can be continued, so it can outgrow the twenty-message ceiling the
 * request contract enforces. Without this the twenty-first turn would be refused as an
 * invalid request — a validation error where the creator sees only a working thread that
 * suddenly stopped working. Trimming the head loses the oldest context, which is the
 * cheaper of the two failures.
 */
export function conversationWindow(
  messages: readonly AssistantApiMessage[],
): AssistantApiMessage[] {
  return messages.slice(-MAX_CONVERSATION_MESSAGES);
}

export type AssistantApiMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantApiRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantDocumentApiRequest = z.infer<typeof assistantDocumentRequestSchema>;
export type AssistantGuestsApiRequest = z.infer<typeof assistantGuestsRequestSchema>;
