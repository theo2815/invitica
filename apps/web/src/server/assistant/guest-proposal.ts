import { MAX_PARSED_GUEST_PARTIES, type ParsedGuestParty } from "../../contracts/assistant-api";
import { guestPartyInputSchema } from "../guests/party-input";
import { MAX_GUEST_QUESTION_CHARACTERS, MAX_GUEST_QUESTIONS } from "./guest-schema";

/**
 * Turns whatever the model returned into rows a creator may review, or a refusal.
 *
 * This is the gate. Above it the answer is a JSON blob a vendor produced; below it, every row
 * has passed `guestPartyInputSchema` — the identical object `createGuestPartiesAction`
 * validates its own input against, imported rather than copied, so the two cannot drift. The
 * route hands the client only what comes out of here and never the raw output.
 *
 * The Romance rule is applied here as well as in the action and again in migration `0030`.
 * That is three checks for one invariant, and deliberately so: this is the layer that decides
 * what a creator is *shown*, and a row that will be rejected on submit should never have been
 * offered as reviewable in the first place.
 */

export type GuestProposalOutcome =
  /** Rows to review. `questions` is what remained unclear after them, and is usually empty. */
  | { parties: ParsedGuestParty[]; questions: string[]; status: "proposed" }
  /**
   * Nothing could be sorted, but the model knows what to ask.
   *
   * The outcome that keeps an unclear request from ending at a dead end. "Add my ninongs"
   * names no one, so there is no row to offer and nothing wrong with the request either —
   * what it needs is the question the creator can answer in one line.
   */
  | { questions: string[]; status: "questions" }
  /** Shaped like an answer, but nothing in it survived the contract and nothing was asked. */
  | { reason: "no_parties"; status: "rejected" }
  /** Not shaped like an answer at all. */
  | { reason: "unreadable"; status: "rejected" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The model's questions, bounded and trimmed.
 *
 * They are model-written prose reaching a creator, so they are held to the same rules the
 * drafting intake's are: an over-long one is dropped rather than cut, because a sentence
 * truncated mid-clause is worse than one never asked, and the batch is capped so a reply
 * still fits in one message.
 */
function resolveQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= MAX_GUEST_QUESTION_CHARACTERS)
    .slice(0, MAX_GUEST_QUESTIONS);
}

/**
 * A row that fails is dropped, not fatal.
 *
 * Same rule the document gate settled on for the same reason: a creator who pasted forty
 * names and got one unusable line should get thirty-nine rows, not a refusal. They can see
 * what is missing — the list is in front of them — and adding one row by hand is a small job,
 * where retyping forty is the thing this feature exists to prevent.
 */
export function resolveGuestPartyProposal(
  output: unknown,
  singleRecipient: boolean,
): GuestProposalOutcome {
  if (!isRecord(output)) return { reason: "unreadable", status: "rejected" };

  const named = output.parties;
  if (!Array.isArray(named)) return { reason: "unreadable", status: "rejected" };

  const questions = resolveQuestions(output.questions);
  const parties: ParsedGuestParty[] = [];

  for (const entry of named) {
    if (parties.length >= MAX_PARSED_GUEST_PARTIES) break;
    if (!isRecord(entry)) continue;

    // Romance rows carry neither field in the schema the model was offered, so a capacity
    // here means the model answered something it was not asked. Dropped rather than
    // corrected to 1: silently rewriting an answer nobody solicited hides the fault, and
    // the contract's own capacity-one rule would reject the row on submit anyway.
    if (singleRecipient && (entry.capacity !== undefined || entry.guestNames !== undefined)) {
      continue;
    }

    // `null` is how the schema lets the model say "address them by the row's own name",
    // which is the ordinary case and the composer's own default.
    const recipientName =
      typeof entry.recipientName === "string" && entry.recipientName.trim().length > 0
        ? entry.recipientName
        : entry.internalLabel;

    const candidate = {
      capacity: singleRecipient ? 1 : entry.capacity,
      guestNames: singleRecipient ? [] : entry.guestNames,
      internalLabel: entry.internalLabel,
      recipientName,
    };

    const parsed = guestPartyInputSchema.safeParse(candidate);
    if (parsed.success) parties.push(parsed.data);
  }

  // Asking is a better answer than refusing, so it is checked first. A list that produced no
  // usable row and no question is the only case left that is genuinely a failure.
  if (parties.length === 0) {
    return questions.length > 0
      ? { questions, status: "questions" }
      : { reason: "no_parties", status: "rejected" };
  }

  return { parties, questions, status: "proposed" };
}
