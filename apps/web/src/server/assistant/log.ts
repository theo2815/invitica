import type { AssistantUsage } from "./provider";

// A signed-out request is not logged at all: there is no creator to attribute it to, and
// inventing an identifier for one would put a stranger in the record.
export type AssistantOutcome = "completed" | "invalid" | "provider_error" | "refused_budget";

/**
 * Everything the assistant is allowed to record about a request.
 *
 * The shape is the control. There is no field a prompt or an answer could be written to,
 * so keeping content out of the log is not a habit someone has to remember at each call
 * site — it is the only thing that type-checks.
 *
 * This preserves the minimal-tracking posture the product already holds for guests, where
 * copy counts and a creator's own "I have sent this" are recorded and nothing a guest reads
 * or writes is. Token counts answer what the feature costs; the text is not needed for that.
 */
export interface AssistantRequestLog {
  creatorId: string;
  durationMs: number;
  messageCount: number;
  model: string;
  outcome: AssistantOutcome;
  stage: "help";
  usage?: AssistantUsage;
}

export function logAssistantRequest(entry: AssistantRequestLog): void {
  console.info("assistant.request", JSON.stringify(entry));
}
