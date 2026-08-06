import type { AssistantApiMessage, ParsedGuestParty } from "../../contracts/assistant-api";

/**
 * The one place the guest-list route is called from the browser.
 *
 * Two surfaces reach it: the Tala panel, which sends a growing conversation so a creator can
 * correct a parse in a sentence, and the Add guests composer, which sends a single paste
 * because its own rows are where corrections happen there. One call site rather than two
 * keeps the refusal handling — a refusal and an error arrive shaped differently — from being
 * written twice and drifting.
 */

export type GuestParsingResult =
  /** `questions` is what stayed unclear after the rows, and is usually empty. */
  | { invitationId: string; parties: ParsedGuestParty[]; questions: string[]; status: "parsed" }
  /** Nothing could be sorted, and Tala knows what to ask to get there. */
  | { questions: string[]; status: "questions" }
  | { message: string; status: "refused" };

export async function requestGuestParties(
  invitationId: string,
  messages: AssistantApiMessage[],
  signal?: AbortSignal,
): Promise<GuestParsingResult> {
  let body: {
    invitationId?: string;
    message?: string;
    parties?: ParsedGuestParty[];
    questions?: string[];
    status?: string;
  };

  try {
    const response = await fetch("/api/creator/assistant/guests", {
      body: JSON.stringify({ invitationId, messages }),
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
      referrerPolicy: "no-referrer",
      ...(signal ? { signal } : {}),
    });
    body = await response.json();
  } catch {
    // Includes the creator pressing Stop. The caller knows which it was from the signal
    // and decides what to show; from here an abandoned request and a dead connection are
    // the same thing — no answer arrived.
    return {
      message: "Invitica could not reach Tala. Check your connection and try again.",
      status: "refused",
    };
  }

  const questions = Array.isArray(body.questions) ? body.questions : [];

  if (body.status === "questions" && questions.length > 0) {
    return { questions, status: "questions" };
  }

  if (body.status !== "parsed" || !Array.isArray(body.parties)) {
    return { message: body.message ?? "Tala is unavailable right now.", status: "refused" };
  }

  return { invitationId, parties: body.parties, questions, status: "parsed" };
}
