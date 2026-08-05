import Anthropic from "@anthropic-ai/sdk";

import {
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

/** Well under the SDK's HTTP timeout, and long enough for a slow Philippine connection. */
const REQUEST_TIMEOUT_MS = 30_000;

function providerError(error: unknown): AssistantProviderError {
  // Retryable means "the same request may succeed shortly", which is what decides whether
  // the creator is offered a retry. Reading it off the SDK's own error classes keeps that
  // decision out of message-string matching.
  const retryable =
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError;

  return new AssistantProviderError(
    retryable
      ? "The assistant is busy right now. Try again in a moment."
      : "The assistant could not answer that. Try again later.",
    { cause: error, retryable },
  );
}

export function createClaudeProvider(model: string = ASSISTANT_MODEL): AssistantProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS });

  return {
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
