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
  | { invitationId: string; parties: ParsedGuestParty[]; status: "parsed" }
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

  if (body.status !== "parsed" || !Array.isArray(body.parties)) {
    return { message: body.message ?? "Tala is unavailable right now.", status: "refused" };
  }

  return { invitationId, parties: body.parties, status: "parsed" };
}
