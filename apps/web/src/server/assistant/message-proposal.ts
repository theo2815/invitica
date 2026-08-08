import {
  generalShareMessageSchema,
  personalShareMessageSchema,
} from "../guests/share-message-input";
import { MAX_MESSAGE_QUESTION_CHARACTERS, MAX_MESSAGE_QUESTIONS } from "./message-schema";

/**
 * Turns whatever the model returned into wording a creator may keep, or a refusal.
 *
 * This is the gate. Above it the answer is a JSON blob a vendor produced; below it, each
 * message has passed the identical schema `saveInvitationShareMessagesAction` validates the
 * save against — imported rather than copied, so the two cannot drift. A proposal that would
 * be rejected on save is therefore never offered as something to keep, which is the whole
 * point of sharing the object: the two failures it prevents are a message with no `{link}`,
 * which is an invitation nobody can open, and an invented placeholder, which reaches a guest
 * as literal `{name}` text.
 *
 * The route hands the client only what comes out of here and never the raw output.
 */

export interface ProposedShareMessages {
  /** Null when the model left this one alone, which is the ordinary case for a one-sided ask. */
  general: null | string;
  personal: null | string;
}

export type ShareMessageOutcome =
  /** Wording to review. `questions` is what stayed unclear after it, and is usually empty. */
  | { messages: ProposedShareMessages; questions: string[]; status: "proposed" }
  /** Nothing could be written yet, and the model knows what to ask to get there. */
  | { questions: string[]; status: "questions" }
  /** Shaped like an answer, but neither message survived the contract. */
  | { reason: "no_messages"; status: "rejected" }
  /** Not shaped like an answer at all. */
  | { reason: "unreadable"; status: "rejected" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One message through the save's own schema, or nothing.
 *
 * A failure here drops that message rather than failing the turn, so a creator who asked for
 * both and got one good one gets the good one. They can see what is missing — the fields are
 * in front of them — and writing one message by hand is a smaller job than writing two.
 */
function resolveMessage(
  value: unknown,
  schema: typeof generalShareMessageSchema | typeof personalShareMessageSchema,
): null | string {
  if (typeof value !== "string") return null;

  const parsed = schema.safeParse(value);
  // The schema turns an empty string into null, which is "clear this back to Invitica's own
  // wording". That is a real answer for a creator to give and not one for a model to give, so
  // an empty proposal is nothing rather than an instruction to clear the field.
  return parsed.success ? parsed.data : null;
}

/** Model-written questions, bounded and trimmed the same way every other path bounds them. */
function resolveQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= MAX_MESSAGE_QUESTION_CHARACTERS)
    .slice(0, MAX_MESSAGE_QUESTIONS);
}

export function resolveShareMessageProposal(
  output: unknown,
  personalOnly: boolean,
): ShareMessageOutcome {
  if (!isRecord(output)) return { reason: "unreadable", status: "rejected" };

  const questions = resolveQuestions(output.questions);
  const personal = resolveMessage(output.personal, personalShareMessageSchema);
  // Romance has no general message on screen at all, so an answer carrying one is answering
  // something it was not asked. Dropped rather than kept: the editor would not show it, and
  // the save preserves whatever general wording was already stored.
  const general = personalOnly ? null : resolveMessage(output.general, generalShareMessageSchema);

  // Asking is a better answer than refusing, so it is checked first.
  if (!personal && !general) {
    return questions.length > 0
      ? { questions, status: "questions" }
      : { reason: "no_messages", status: "rejected" };
  }

  return { messages: { general, personal }, questions, status: "proposed" };
}
