import type { AssistantMode } from "../../contracts/assistant-api";

/**
 * Which tab the thing a creator is typing actually belongs in.
 *
 * Tala's three tabs are three endpoints at three costs, and the mode stays explicit for the
 * reason recorded on `assistantModeSchema`: inferring it would mean a billed call to decide
 * where to send the next one. **Recommending is not inferring.** This runs on composer text
 * before anything is sent, costs nothing, and produces a suggestion the creator accepts or
 * dismisses — so a wrong answer costs a glance rather than a message from the daily allowance.
 *
 * It is deliberately narrow. Every question that does not match is answered exactly as it is
 * today, and the help prompt covers the rest; the failure this exists to prevent is the
 * expensive one, where a creator asks "how do I publish?" in the drafting tab and spends a
 * document turn on a proposal that changes nothing.
 *
 * Nothing here reads a model's output. Control flow driven by generated prose is how this
 * would get fragile, so the signals are the creator's own words and nothing else.
 */

/**
 * Asking how Invitica works, rather than describing an event or a guest list.
 *
 * Mostly interrogatives, because that is what separates "how do I add a programme?" from
 * "add a programme: cocktails at 6". The handful of bare nouns below are things that exist
 * only as product mechanics — a creator never means "publish" as invitation wording.
 */
const HELP_SIGNALS: readonly RegExp[] = [
  /\bhow (do|does|did|can|could|would|should) (i|we|you|it|my|our|the|this|that)\b/i,
  /\bwhat happens (when|if|to|after)\b/i,
  /\bwhy (can'?t|cannot|won'?t|isn'?t|aren'?t|doesn'?t|don'?t|does|is|are|do|did)\b/i,
  /\bwhere (do|does|can|is|are) (i|we|my|our|the|this|it)\b/i,
  /\bis (it|this|that) (possible|free|safe)\b/i,
  /\bdoes invitica\b/i,
  /\b(un)?publish(ed|es|ing)?\b/i,
  /\b(personal|personalised|personalized|general|guest) links?\b/i,
  /\bqr code\b/i,
  /\breply form\b/i,
];

/**
 * A change to the invitation's own content.
 *
 * A verb on its own is not enough — "add Tita Baby" is a guest, not a section — so an edit
 * verb has to land beside something the invitation actually holds. The two exceptions are a
 * section named outright, which is unambiguous, and a request about tone.
 */
const DOCUMENT_EDIT_VERBS =
  /\b(add|change|update|edit|fix|correct|rewrite|reword|rephrase|shorten|lengthen|set|move|replace|remove|delete|hide|show|include|mention|put|write|draft)\b/i;

const DOCUMENT_SUBJECTS =
  /\b(date|time|venue|address|location|ceremony|reception|programme|program|schedule|itinerary|timeline|dress ?code|attire|entourage|wedding party|principal sponsors|sponsors|gifts?|registry|story|greeting|headline|title|caption|gallery|album|countdown|wording|colou?rs)\b/i;

/**
 * "Section 5", spelled either way.
 *
 * Eleven is the widest production template, so the words stop there; anything higher is a
 * digit in practice. The numbering itself is per invitation and lives in
 * `section-vocabulary.ts` — this only has to notice that a section was named at all.
 */
const SECTION_REFERENCE =
  /\bsection\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven)\b/i;

/** "Make it warmer", "make it sound more formal". A request about wording, not about a page. */
const TONE_REQUEST = /\bmake it (sound |read |feel )?(more |less )?[a-z]+\b/i;

/**
 * A list of people, as one actually arrives.
 *
 * The word "guest" alone is not a signal — it is in half the help material, and "why can't my
 * guest see the reply form?" is a help question. What marks a real list is counting: a "+2", a
 * number of seats, a family with a size after it. The Filipino terms of address are here
 * because they are how these lists are written in this market and they appear in a help
 * question essentially never.
 */
const GUEST_SIGNALS: readonly RegExp[] = [
  /\bguest list\b/i,
  /\bguest names\b/i,
  /\blist of (guests|names|people)\b/i,
  /\b(add|remove|take)\b[^.\n]{0,40}\b(to|from|off) (my|our|the) (guest )?list\b/i,
  /\+\s?\d+\b/,
  /\b\d+\s?pax\b/i,
  /\b\d+\s?seats?\b/i,
  /\b(tita|tito|kuya|ate|ninong|ninang|lola|lolo|manong|manang)\b/i,
  /\bfamily\b[^.\n]{0,20}\d/i,
];

/**
 * Below this a match is an accident rather than an intention.
 *
 * Short enough that "section 5" still counts, which is the shortest thing a creator says that
 * this has to catch.
 */
const MIN_TEXT_LENGTH = 8;

const MODES: readonly AssistantMode[] = ["document", "guests", "help"];

export interface ModeSuggestion {
  /** Why Tala is offering it, in the creator's words. Shown beside the switch. */
  reason: string;
  to: AssistantMode;
}

const SUGGESTION_REASON: Record<AssistantMode, string> = {
  document: "That reads like a change to your invitation.",
  guests: "That reads like a guest list.",
  help: "That reads like a question about how Invitica works.",
};

function matchesAny(text: string, signals: readonly RegExp[]): boolean {
  return signals.some((signal) => signal.test(text));
}

function looksLikeDocument(text: string): boolean {
  if (SECTION_REFERENCE.test(text) || TONE_REQUEST.test(text)) return true;
  return DOCUMENT_EDIT_VERBS.test(text) && DOCUMENT_SUBJECTS.test(text);
}

export interface ModeRoutingInput {
  /**
   * Whether Tala can draft into the invitation in context. False with none selected, and
   * false for legacy Garden Promise v1, whose editor cannot stage a proposal.
   */
  canDraft: boolean;
  /**
   * Whether that invitation has a guest list to organize, which means whether it is
   * published. Guest parties belong to a published invitation and nothing else.
   */
  canOrganize: boolean;
  mode: AssistantMode;
  /** What is in the composer. Not sent anywhere; this runs before the message is spent. */
  text: string;
}

/**
 * The tab this text belongs in, or nothing.
 *
 * Two rules keep it quiet, and both fail towards silence:
 *
 * 1. **Text that also belongs where the creator already is stays there.** "How do I change the
 *    reception time?" reads as a help question and as an edit; asked in the help tab it is a
 *    help question, and interrupting it would be wrong.
 * 2. **Two offerable candidates cancel out.** "Change the reception time and add Tita Baby +2"
 *    is genuinely two requests, and guessing which one to offer would be right half the time.
 *
 * A tab the creator cannot use is never offered, so a suggestion cannot route someone into a
 * refusal they had no way to see coming. That filter runs before the count above, which is why
 * the same two-request sentence still offers drafting to a creator who cannot organize guests
 * yet: only one of the two is a thing they could act on.
 */
export function suggestMode({ canDraft, canOrganize, mode, text }: ModeRoutingInput) {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH) return null;

  const signals: Record<AssistantMode, boolean> = {
    document: looksLikeDocument(trimmed),
    guests: matchesAny(trimmed, GUEST_SIGNALS),
    help: matchesAny(trimmed, HELP_SIGNALS),
  };

  // Rule 1. Checked on the signal rather than on availability, so a creator sitting in a tab
  // whose ability could not be confirmed is still left alone when the text belongs to it.
  if (signals[mode]) return null;

  const available: Record<AssistantMode, boolean> = {
    document: canDraft,
    guests: canOrganize,
    help: true,
  };

  const targets = MODES.filter((candidate) => candidate !== mode && signals[candidate]).filter(
    (candidate) => available[candidate],
  );

  // Rule 2. Exactly one, or nothing.
  const to = targets.length === 1 ? targets[0] : undefined;
  if (!to) return null;

  return { reason: SUGGESTION_REASON[to], to } satisfies ModeSuggestion;
}
