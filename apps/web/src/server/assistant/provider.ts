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
 * The output schema the first stage deliberately left out now exists, because document
 * proposing is the caller that needed it. It sits on `generate` rather than on the shared
 * request: streaming a help answer and constraining a document are different jobs, and
 * folding them into one call would have given every help request a field it never sets.
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

/**
 * A request whose answer must satisfy a JSON Schema rather than be prose.
 *
 * The schema is built per request, from the sections the creator's own draft declares, so
 * it is not a constant living beside the prompt. It bounds the shape the model may emit;
 * it does not make that shape trustworthy — see `AssistantGeneration.output`.
 */
export interface AssistantGenerateRequest extends AssistantRequest {
  outputSchema: Record<string, unknown>;
}

export interface AssistantGeneration {
  /**
   * The model's JSON answer, parsed but **not** validated. Schema-shaped is not the same
   * as correct, and no caller may pass this to a renderer or a save path without first
   * putting it through the invitation contract.
   */
  output: unknown;
  stopReason: null | string;
  usage: AssistantUsage;
}

export interface AssistantProvider {
  /**
   * One structured answer, not a stream. A proposal is only useful once it is whole and
   * has survived validation, so there is nothing to show a creator token by token.
   */
  generate(request: AssistantGenerateRequest, signal?: AbortSignal): Promise<AssistantGeneration>;
  /** The exact model identifier, for the request log and the measured-cost record. */
  readonly model: string;
  stream(request: AssistantRequest, signal?: AbortSignal): AsyncIterable<AssistantStreamEvent>;
}

/**
 * Why a request failed, in terms the route can act on.
 *
 * - `configuration` — the key is wrong, missing, or lacks access. No creator can fix this
 *   and no retry will help; it is a deployment fault.
 * - `transient` — rate limited, overloaded, or a dropped connection. The same request may
 *   work shortly.
 * - `provider` — anything else the vendor rejected.
 */
export type AssistantFailureKind = "configuration" | "provider" | "transient";

/**
 * Three machine-readable classifiers and nothing else.
 *
 * Deliberately no free text. `log.ts` keeps prompt and response content out of the record by
 * having nowhere to put it, and a vendor's error message is the one field that could quote a
 * request back. The class name, the HTTP status, and the API's own error type are enough to
 * tell a bad key from a rate limit from a bug, which is all the log is for.
 */
export interface AssistantFailure {
  kind: AssistantFailureKind;
  /** The SDK's error class, such as `AuthenticationError`. */
  name: string;
  status?: number;
  /** The API's machine-readable type, such as `authentication_error`. */
  type?: string;
}

/**
 * A provider failure the route can turn into a message, separated from a bug by the
 * `retryable` flag rather than by parsing a vendor error string.
 */
export class AssistantProviderError extends Error {
  readonly failure: AssistantFailure;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { cause?: unknown; failure: AssistantFailure; retryable: boolean },
  ) {
    super(message, { cause: options.cause });
    this.name = "AssistantProviderError";
    this.failure = options.failure;
    this.retryable = options.retryable;
  }
}
