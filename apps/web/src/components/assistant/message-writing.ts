import type { AssistantApiMessage } from "../../contracts/assistant-api";

/**
 * The one place the message-writing route is called from the browser.
 *
 * One call site rather than one per surface, the same rule `guest-parsing.ts` follows and for
 * the same reason: a refusal and an error arrive shaped differently, and handling that in two
 * places is handling it two ways within a release or two.
 */

export type ShareMessageWritingResult =
  /** Wording for the fields. Either message may be null when Invi left it alone. */
  | {
      general: null | string;
      personal: null | string;
      questions: string[];
      status: "written";
    }
  /** Nothing could be written yet, and Invi knows what to ask to get there. */
  | { questions: string[]; status: "questions" }
  | { message: string; status: "refused" };

export async function requestShareMessages(
  invitationId: string,
  messages: AssistantApiMessage[],
  signal?: AbortSignal,
): Promise<ShareMessageWritingResult> {
  let body: {
    general?: null | string;
    message?: string;
    personal?: null | string;
    questions?: string[];
    status?: string;
  };

  try {
    const response = await fetch("/api/creator/assistant/message", {
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
    // Includes an abandoned request. From here that and a dead connection are the same thing:
    // no answer arrived.
    return {
      message: "Invitica could not reach Invi. Check your connection and try again.",
      status: "refused",
    };
  }

  const questions = Array.isArray(body.questions) ? body.questions : [];

  if (body.status === "questions" && questions.length > 0) {
    return { questions, status: "questions" };
  }

  if (body.status !== "written") {
    return { message: body.message ?? "Invi is unavailable right now.", status: "refused" };
  }

  return {
    general: typeof body.general === "string" ? body.general : null,
    personal: typeof body.personal === "string" ? body.personal : null,
    questions,
    status: "written",
  };
}
