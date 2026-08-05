/**
 * The narrow boundary between Invitica's assistant and whichever hosted model answers
 * for it.
 *
 * ADR-008 rents the model and owns the assistant. Everything above this interface —
 * the help corpus, the budget, the auth gate, the prompt — is Invitica's; everything
 * below it is one vendor's SDK. Swapping the vendor means writing one more file that
 * satisfies `AssistantProvider`; swapping the model means editing one config value in
 * the implementation.
 *
 * Deliberately absent: an output schema. The plan for this stage named one, but no
 * caller in it produces structured output, and an unused field on a contract is a
 * promise nobody has kept. Document proposing adds it where a test can exercise it.
 */

export type AssistantRole = "assistant" | "user";

export interface AssistantMessage {
  content: string;
  role: AssistantRole;
}

export interface AssistantRequest {
  /**
   * The full instruction prefix, including any corpus the answer must be sourced from.
   * Implementations should mark this cacheable: it is identical on every request and is
   * by far the largest part of one.
   */
  systemPrompt: string;
  /** The current conversation, oldest first. Never includes the system prompt. */
  messages: AssistantMessage[];
  /** Hard ceiling on generated tokens. Bounds the per-message bill. */
  maxOutputTokens: number;
}

export interface AssistantUsage {
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * `text` arrives repeatedly as the answer is generated; `complete` arrives exactly once,
 * last, and carries the numbers the budget and the cost record are written from.
 */
export type AssistantStreamEvent =
  | { text: string; type: "text" }
  | { stopReason: null | string; type: "complete"; usage: AssistantUsage };

export interface AssistantProvider {
  /** The exact model identifier, for the request log and the measured-cost record. */
  readonly model: string;
  stream(request: AssistantRequest, signal?: AbortSignal): AsyncIterable<AssistantStreamEvent>;
}

/**
 * A provider failure the route can turn into a message, separated from a bug by the
 * `retryable` flag rather than by parsing a vendor error string.
 */
export class AssistantProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options: { cause?: unknown; retryable: boolean }) {
    super(message, { cause: options.cause });
    this.name = "AssistantProviderError";
    this.retryable = options.retryable;
  }
}
