// @vitest-environment node
//
// Node, not the suite's default jsdom: the Anthropic SDK refuses to construct a client in a
// browser-like environment because a key there would be shipped to the user. This is server
// code and belongs on the server side of that check, so the right answer is the correct
// environment rather than `dangerouslyAllowBrowser`.

import { describe, expect, it } from "vitest";

import { createClaudeProvider } from "../src/server/assistant/claude";
import { HELP_SYSTEM_PROMPT, MAX_OUTPUT_TOKENS } from "../src/server/assistant/prompt";

/**
 * The two live measurements Task 7a finished without: what a help message actually costs,
 * and proof that the corpus prefix is cached rather than re-billed on every request.
 *
 * **This makes real, billed API calls** — two of them — and is gated exactly as the model
 * comparison is, so `pnpm check` never spends money.
 *
 *     ASSISTANT_MODEL_COMPARISON=1 ANTHROPIC_API_KEY=sk-... \
 *       pnpm --filter @invitica/web exec vitest run tests/AssistantHelpCacheProof.test.ts
 *
 * The proof is structural rather than incidental: two requests with a byte-identical system
 * block, sent back to back. The first pays to write the cache, the second must read it. If
 * the second reads nothing, the `cache_control` breakpoint in `claude.ts` is decorative and
 * every help message is paying full input price — which is worth failing a run over, because
 * nothing else in the suite can notice it.
 */

const enabled =
  process.env.ASSISTANT_MODEL_COMPARISON === "1" && Boolean(process.env.ANTHROPIC_API_KEY);

/** Published per-million rates for `ASSISTANT_MODEL`, read 2026-08-06. */
const HAIKU_INPUT_RATE = 1;
const HAIKU_OUTPUT_RATE = 5;

interface Usage {
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
  inputTokens: number;
  outputTokens: number;
}

async function ask(question: string): Promise<Usage> {
  const provider = createClaudeProvider();
  let usage: Usage | undefined;
  let answer = "";

  for await (const event of provider.stream({
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    messages: [{ content: question, role: "user" }],
    systemPrompt: HELP_SYSTEM_PROMPT,
  })) {
    if (event.type === "text") answer += event.text;
    if (event.type === "complete") usage = event.usage;
  }

  if (!usage) throw new Error("The stream ended without a completion event.");

  console.info(
    `  in ${usage.inputTokens} · cacheWrite ${usage.cacheWriteInputTokens} · cacheRead ${usage.cacheReadInputTokens} · out ${usage.outputTokens} · answered in ${answer.length} characters`,
  );

  return usage;
}

describe.runIf(enabled)("the live help path", () => {
  it("caches the corpus prefix and reads it back on an identical request", {
    timeout: 3 * 60_000,
  }, async () => {
    // Two different questions on purpose. Only the system block is identical, so a cache
    // read on the second call can only have come from the prefix — not from the whole
    // request happening to repeat.
    //
    // Whether the first call writes the cache or already reads one depends on whether
    // anything asked in the previous five minutes, so neither call is labelled "cold": the
    // run reports what each actually did instead of what it was expected to do.
    console.info("\n=== help request 1 ===");
    const first = await ask("How do I publish an invitation?");

    console.info("=== help request 2 (must read the prefix) ===");
    const second = await ask("Can I change a template after I have started a draft?");

    expect(second.cacheReadInputTokens).toBeGreaterThan(0);

    const cost = (usage: Usage) =>
      ((usage.inputTokens + usage.cacheWriteInputTokens * 1.25 + usage.cacheReadInputTokens * 0.1) *
        HAIKU_INPUT_RATE +
        usage.outputTokens * HAIKU_OUTPUT_RATE) /
      1_000_000;

    /** The same request billed as if the breakpoint were not there, for the comparison. */
    const uncached = (usage: Usage) =>
      ((usage.inputTokens + usage.cacheWriteInputTokens + usage.cacheReadInputTokens) *
        HAIKU_INPUT_RATE +
        usage.outputTokens * HAIKU_OUTPUT_RATE) /
      1_000_000;

    console.info("\n=== measured help cost ===");
    for (const [label, usage] of [
      ["request 1", first],
      ["request 2", second],
    ] as const) {
      console.info(
        `${label}: $${cost(usage).toFixed(6)} as billed · $${uncached(usage).toFixed(6)} without the cache breakpoint`,
      );
    }
    console.info(
      `a creator's full 20-message daily allowance at request 2's rate: $${(cost(second) * 20).toFixed(4)}`,
    );
  });
});
