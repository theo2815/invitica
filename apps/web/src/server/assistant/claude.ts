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
 * The model that drafts invitation documents. **Measured, not reasoned.**
 *
 * ADR-008 left this unset on purpose and Task 7b's criteria asked for a schema-pass rate
 * across all three candidates. That run happened on 2026-08-06, through the same two-call
 * path the route uses, over six fixtures spanning all five production occasions:
 *
 * | model             | passed | cost per document turn |
 * |-------------------|--------|------------------------|
 * | `claude-haiku-4-5`| 5 / 6  | $0.0041                |
 * | `claude-sonnet-5` | 3 / 6  | $0.0122                |
 * | `claude-opus-5`   | 6 / 6  | $0.0527                |
 *
 * Haiku, by founder decision on cost, and the evidence agrees with it more than the price
 * alone would. **Sonnet 5 lost on reliability, not on money**: its three failures were all
 * client timeouts at fifty seconds, so it is slow enough at this workload to fail on a
 * creator's screen whatever it costs. Opus is the only clean sweep and is 9.5x Haiku for
 * it, which is not a trade worth making against a PHP 5,000/month ceiling when the daily
 * message cap — not the model — is what actually bounds the bill.
 *
 * The reasoning this constant used to carry was wrong in a way worth recording. It ruled
 * Haiku out for not clearing its 4,096-token cache floor. That is true — the run measured
 * `cacheWrite 0` on every Haiku call — but it costs nothing here: the prefix is ~2,512
 * tokens, so the discount forgone is a fraction of a rate that is already the lowest of
 * the three. Reasoning about a model's characteristics is not the same as measuring the
 * workload, which is why the criteria asked for a run.
 *
 * The one failure is the romance fixture, rejected by the invitation contract rather than
 * by the schema, on the only template with the romantic-question RSVP branch. Reproduced
 * across two separate runs, so it is a real weak spot and not noise.
 */
export const ASSISTANT_DOCUMENT_MODEL = "claude-haiku-4-5";

/**
 * The model that decides which sections a request is about, before the document model
 * drafts them. See `section-selection.ts` for why that call exists at all.
 *
 * Haiku because the job is classification against a list that is already in the prompt, the
 * answer is a few tokens, and it runs on every document request — the same reasoning that
 * put help answers on it.
 */
export const ASSISTANT_SELECTION_MODEL = "claude-haiku-4-5";

/**
 * The model that turns a pasted guest list into party rows.
 *
 * Haiku for the same reason as the two above, and with one more behind it: this is the only
 * workload whose input is other people's names, so the smallest capable model is also the
 * one that sends those names to the least. Extraction against an explicit schema is the job
 * Haiku is strongest at — there is no prose to write, no tone to hold, and no judgement to
 * make beyond reading a number off a line.
 *
 * Unmeasured at the time of writing. The document model was set by a live comparison and
 * this one was not; there is a harness to copy in `AssistantDocumentModelComparison` if a
 * later task wants the same evidence here.
 */
export const ASSISTANT_GUESTS_MODEL = "claude-haiku-4-5";

/**
 * The model that writes the message a creator sends with their invitation link.
 *
 * Haiku, and this is the workload it suits best of the five: the answer is two short
 * templates, the placeholder rules are explicit in the prompt, and the invitation's own
 * details are supplied rather than recalled. There is no document to keep consistent and no
 * schema wide enough to strain a grammar.
 *
 * Unmeasured, like `ASSISTANT_GUESTS_MODEL` and unlike `ASSISTANT_DOCUMENT_MODEL`. The one
 * quality that would justify a comparison is whether a larger model holds the placeholder
 * contract more reliably, and that is the thing this path does not have to trust: a message
 * missing `{link}` or carrying an invented placeholder is rejected by
 * `share-message-input.ts` before a creator ever sees it.
 */
export const ASSISTANT_MESSAGE_MODEL = "claude-haiku-4-5";

/** Well under the SDK's HTTP timeout, and long enough for a slow Philippine connection. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Longer than the streaming ceiling above, because the two are not the same problem.
 *
 * A streamed help answer only has to *start* inside its timeout; the stream then holds the
 * connection open for as long as it takes. A structured generation has to finish inside it,
 * and a whole invitation is a far larger answer than a help reply. Measured 2026-08-06:
 * `claude-sonnet-5` timed out at 30 seconds on a fixture `claude-opus-5` completed, which
 * is a shipped-model failure that no test could have caught without a live call.
 *
 * Sized to sit under the route's own `maxDuration` with room for the auth, budget, and
 * validation work either side of it, and retries are off: a generation that has already
 * spent fifty seconds has spent the creator's patience too, and quietly starting again
 * would bill twice for an answer nobody is still waiting for.
 */
const DOCUMENT_REQUEST_TIMEOUT_MS = 50_000;

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
        "Invi is not set up correctly, so it cannot answer right now. This is a problem on Invitica's side, not with your invitation."
      : failure.kind === "transient"
        ? "Invi is busy right now. Try again in a moment."
        : "Invi could not answer that. Try again later.";

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
          { maxRetries: 0, signal, timeout: DOCUMENT_REQUEST_TIMEOUT_MS },
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
            : "Invi could not draft that invitation. Try describing it again.",
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
