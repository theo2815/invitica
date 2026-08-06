import type { AssistantFailure, AssistantUsage } from "./provider";

// A signed-out request is not logged at all: there is no creator to attribute it to, and
// inventing an identifier for one would put a stranger in the record.
export type AssistantOutcome =
  | "completed"
  | "invalid"
  | "provider_error"
  /** The model answered, and the invitation contract rejected what it said. */
  | "rejected_proposal"
  | "refused_budget";

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
  /**
   * Why a `provider_error` happened, when one did.
   *
   * Three machine-readable classifiers, no free text — see `AssistantFailure`. Without this
   * an invalid key and a rate limit produce the same log line, and the only way to tell them
   * apart is to reproduce the call by hand against the configured key. That is exactly what
   * happened on 2026-08-06, which is why the field exists.
   */
  failure?: AssistantFailure;
  messageCount: number;
  model: string;
  outcome: AssistantOutcome;
  /**
   * Which workload this was. Recorded because they cost very differently — a help reply is
   * a few hundred tokens against a cached corpus, a document proposal is a whole invitation
   * — and one daily allowance covers all of them.
   *
   * `section-selection` is the cheap first half of a document request. It gets its own line
   * rather than being folded into the document one because it runs on a different model:
   * summing the two would produce a token total that no published rate can price.
   */
  stage: "document" | "help" | "section-selection";
  usage?: AssistantUsage;
}

export function logAssistantRequest(entry: AssistantRequestLog): void {
  console.info("assistant.request", JSON.stringify(entry));
}
