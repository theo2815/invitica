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

export const assistantRequestSchema = z.object({
  messages: z
    .array(assistantMessageSchema)
    .min(1)
    .max(MAX_CONVERSATION_MESSAGES)
    // A thread that does not end with the creator has nothing to answer. Rejecting it here
    // keeps a malformed client from spending a message on an empty turn.
    .refine((messages) => messages.at(-1)?.role === "user", {
      message: "The last message must come from the creator.",
    }),
});

export type AssistantApiMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantApiRequest = z.infer<typeof assistantRequestSchema>;
