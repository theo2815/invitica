import Anthropic from "@anthropic-ai/sdk";

import {
  type AssistantFailure,
  type AssistantGenerateRequest,
  type AssistantGeneration,
  type AssistantProvider,
  AssistantProviderError,
  type AssistantRequest,
  type AssistantStreamEvent,
} from "./provider";

/**
 * The one config value the model choice lives in.
 *
 * `claude-haiku-4-5` answers help questions: the corpus does the work, so the model only
 * has to read and summarize it. ADR-008 leaves the document-proposing model unset on
 * purpose — it is chosen by measured schema-pass rate in the next stage, not here.
 *
 * Two Haiku 4.5 constraints shaped the request below. Its minimum cacheable prefix is
 * 4,096 tokens, so `cache_control` on the system block does nothing unless the corpus
 * clears that — silently, with no error and a zero in `cache_read_input_tokens`. And it
 * predates `output_config.effort`, which errors on this model rather than being ignored.
 */
export const ASSISTANT_MODEL = "claude-haiku-4-5";

/**
 * The model that drafts invitation documents. **Provisional.**
 *
 * ADR-008 left this unset on purpose and Task 7b's plan chose it by measuring schema-pass
 * rate across `claude-haiku-4-5`, `claude-sonnet-5`, and `claude-opus-5`. That measurement
 * needs a real key, which no agent session has by the founder's own choice, so the value
 * below is reasoned rather than measured and says so:
 *
 * - **Haiku 4.5** predates `output_config.effort` and adaptive thinking, and its minimum
 *   cacheable prefix is 4,096 tokens — four times the others', which the per-template
 *   prompt here does not clear.
 * - **Opus 5** is five times Sonnet 5's input price for a job whose output is bounded by a
 *   schema rather than by reasoning depth.
 * - **Sonnet 5** supports structured outputs, caches from 1,024 tokens, and sits between
 *   them on price.
 *
 * `tests/AssistantDocumentModelComparison.test.ts` runs the fixture set against all three
 * and prints the pass rates. It is gated behind an explicit opt-in because it bills real
 * calls. Replace this constant with whatever that run actually shows.
 */
export const ASSISTANT_DOCUMENT_MODEL = "claude-sonnet-5";

/** Well under the SDK's HTTP timeout, and long enough for a slow Philippine connection. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Reads the vendor's own error classes rather than matching on message strings, so the
 * route's decisions survive a wording change at the provider.
 */
function classify(error: unknown): AssistantFailure {
  // A key that is wrong, revoked, or scoped to another workspace. No retry helps and no
  // creator can act on it, so it is worth telling apart from everything else.
  const configuration =
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError;

  const transient =
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError;

  const status = error instanceof Anthropic.APIError ? error.status : undefined;
  const type =
    error instanceof Anthropic.APIError && typeof error.type === "string" ? error.type : undefined;

  return {
    kind: configuration ? "configuration" : transient ? "transient" : "provider",
    name: error instanceof Error ? error.constructor.name : "UnknownError",
    // Omitted rather than set to undefined: `exactOptionalPropertyTypes` rejects the latter,
    // and an absent key reads as "the vendor reported none" instead of as a null status.
    ...(status === undefined ? {} : { status }),
    ...(type === undefined ? {} : { type }),
  };
}

function providerError(error: unknown): AssistantProviderError {
  const failure = classify(error);

  const message =
    failure.kind === "configuration"
      ? // Says plainly that this is Invitica's problem. A creator told to "try again later"
        // for a bad key would keep trying, and keep failing, for as long as it took someone
        // to notice.
        "The assistant is not set up correctly, so it cannot answer right now. This is a problem on Invitica's side, not with your invitation."
      : failure.kind === "transient"
        ? "The assistant is busy right now. Try again in a moment."
        : "The assistant could not answer that. Try again later.";

  return new AssistantProviderError(message, {
    cause: error,
    failure,
    retryable: failure.kind === "transient",
  });
}

export function createClaudeProvider(model: string = ASSISTANT_MODEL): AssistantProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS });

  return {
    async generate(
      request: AssistantGenerateRequest,
      signal?: AbortSignal,
    ): Promise<AssistantGeneration> {
      let message: Awaited<ReturnType<typeof client.messages.create>>;

      try {
        message = await client.messages.create(
          {
            max_tokens: request.maxOutputTokens,
            messages: request.messages.map((entry) => ({
              content: entry.content,
              role: entry.role,
            })),
            model,
            // The schema constrains the shape the model may emit. It is not a trust
            // boundary — `parsed` below is still fed through the invitation contract
            // before anything downstream sees it.
            output_config: { format: { schema: request.outputSchema, type: "json_schema" } },
            system: [
              {
                cache_control: { type: "ephemeral" },
                text: request.systemPrompt,
                type: "text",
              },
            ],
          },
          { signal },
        );
      } catch (error) {
        throw providerError(error);
      }

      const text = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();

      let output: unknown;
      try {
        output = JSON.parse(text);
      } catch (error) {
        // A truncated answer is the likely cause, and it is worth saying so separately:
        // "the model wrote something unusable" and "the model ran out of room" lead to
        // different fixes.
        throw new AssistantProviderError(
          message.stop_reason === "max_tokens"
            ? "That invitation was too long to draft in one go. Try describing one part of it."
            : "The assistant could not draft that invitation. Try describing it again.",
          {
            cause: error,
            // The call itself succeeded and was billed; the answer was unusable. That is a
            // provider fault, not a configuration one, and must not trip the kill switch.
            failure: { kind: "provider", name: "UnparseableProposal" },
            retryable: false,
          },
        );
      }

      return {
        output,
        stopReason: message.stop_reason,
        usage: {
          cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteInputTokens: message.usage.cache_creation_input_tokens ?? 0,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    },
    model,
    async *stream(
      request: AssistantRequest,
      signal?: AbortSignal,
    ): AsyncIterable<AssistantStreamEvent> {
      // The system block carries the whole corpus and is byte-identical on every request,
      // so it is the only thing worth a cache breakpoint. Everything that varies — the
      // creator's own messages — renders after it and cannot invalidate it.
      const stream = client.messages.stream(
        {
          max_tokens: request.maxOutputTokens,
          messages: request.messages.map((message) => ({
            content: message.content,
            role: message.role,
          })),
          model,
          system: [
            {
              cache_control: { type: "ephemeral" },
              text: request.systemPrompt,
              type: "text",
            },
          ],
        },
        { signal },
      );

      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { text: event.delta.text, type: "text" };
          }
        }

        const message = await stream.finalMessage();

        yield {
          stopReason: message.stop_reason,
          type: "complete",
          usage: {
            cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
            cacheWriteInputTokens: message.usage.cache_creation_input_tokens ?? 0,
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
          },
        };
      } catch (error) {
        throw providerError(error);
      }
    },
  };
}
