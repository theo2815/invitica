// @vitest-environment node
//
// Node, not the suite's default jsdom: the Anthropic SDK refuses to construct a client in a
// browser-like environment, because a key there would be shipped to the user. This is server
// code and belongs on the server side of that check.

import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById, templateStarterDocument } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import { ASSISTANT_SELECTION_MODEL, createClaudeProvider } from "../src/server/assistant/claude";
import {
  currentDraftMessage,
  documentSystemPrompt,
  MAX_DOCUMENT_OUTPUT_TOKENS,
} from "../src/server/assistant/document-prompt";
import { resolveDocumentProposal } from "../src/server/assistant/document-proposal";
import { buildProposalSchema } from "../src/server/assistant/document-schema";
import {
  buildSectionSelectionSchema,
  MAX_SELECTION_OUTPUT_TOKENS,
  resolveSectionSelection,
  sectionSelectionSystemPrompt,
} from "../src/server/assistant/section-selection";
import { DOCUMENT_PROMPT_FIXTURES } from "./fixtures/assistant-document-prompts";

/**
 * The measured comparison behind `ASSISTANT_DOCUMENT_MODEL`.
 *
 * **This makes real, billed API calls.** It is therefore off unless it is asked for twice —
 * a key *and* `ASSISTANT_MODEL_COMPARISON=1` — so that a founder who has a key in their
 * environment for ordinary work never has `pnpm check` quietly spend money.
 *
 *     ASSISTANT_MODEL_COMPARISON=1 ANTHROPIC_API_KEY=sk-... \
 *       pnpm --filter @invitica/web exec vitest run tests/AssistantDocumentModelComparison.test.ts
 *
 * It is a test only because that is the cheapest correct runner: it needs the template
 * registry, the invitation contract, and the prompt builders, all of which are TypeScript
 * in this workspace. A standalone script would have needed a new dependency to read them.
 *
 * What it prints is the evidence Task 7b's plan asked for — a schema-pass rate per model,
 * counted rather than judged, plus the tokens each turn actually used so cost per document
 * can be computed instead of estimated. Read the generated copy as well as the counts: a
 * model can pass the schema every time and still write invitations nobody would send.
 */

/**
 * All three by default. `ASSISTANT_COMPARISON_MODELS=claude-haiku-4-5` narrows it, which is
 * what a re-run after a prompt change wants: re-measuring the model you already chose costs
 * a tenth of re-measuring the field, and the field has already been decided once.
 */
const CANDIDATE_MODELS = (
  process.env.ASSISTANT_COMPARISON_MODELS?.split(",").map((entry) => entry.trim()) ?? [
    "claude-haiku-4-5",
    "claude-sonnet-5",
    "claude-opus-5",
  ]
).filter(Boolean);

/**
 * Published per-million rates, read 2026-08-06. Here so the run prints money rather than
 * tokens — [[Operations/Provider and Cost Ledger]] needs a measured figure, and a number
 * the founder has to compute by hand is a number that stays `TBD`.
 *
 * These drift. A rate that is stale makes the printed cost wrong and nothing else: the
 * token counts above it are measured and stay true, so re-costing is arithmetic on the
 * same run rather than another billed one.
 */
const RATES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-5": { input: 5, output: 25 },
  // The introductory rate, which stands until 2026-08-31; $3.00/$15.00 after.
  "claude-sonnet-5": { input: 2, output: 10 },
};

const enabled =
  process.env.ASSISTANT_MODEL_COMPARISON === "1" && Boolean(process.env.ANTHROPIC_API_KEY);

interface Tally {
  /** Billed at 0.1x input. Non-zero is the proof that the per-template prefix cached. */
  cacheReadTokens: number;
  /** Billed at 1.25x input. */
  cacheWriteTokens: number;
  failures: string[];
  /** Uncached input only, so the three buckets can be priced at their three rates. */
  inputTokens: number;
  outputTokens: number;
  passed: number;
  total: number;
}

describe.runIf(enabled)("document model comparison", () => {
  it("records the schema-pass rate and token cost of each candidate model", {
    timeout: 15 * 60_000,
  }, async () => {
    const tallies = new Map<string, Tally>();
    const selector = createClaudeProvider(ASSISTANT_SELECTION_MODEL);
    // One tally across all three runs: the selection model does not vary with the candidate,
    // so its cost is a constant every document turn pays on top of whichever model drafts.
    const selectionTally = { inputTokens: 0, outputTokens: 0 };

    for (const model of CANDIDATE_MODELS) {
      const tally: Tally = {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        failures: [],
        inputTokens: 0,
        outputTokens: 0,
        passed: 0,
        total: 0,
      };
      tallies.set(model, tally);
      const provider = createClaudeProvider(model);

      for (const fixture of DOCUMENT_PROMPT_FIXTURES) {
        const manifest = resolveTemplateById(fixture.templateId);
        // The starter document, because that is what a creator's own new draft holds —
        // measuring against the catalog showcase would hand the model most of the answer.
        const document = parseInvitationDocument(
          structuredClone(templateStarterDocument(manifest)),
        );

        tally.total += 1;

        try {
          const messages = [
            { content: currentDraftMessage(document), role: "user" as const },
            { content: fixture.prompt, role: "user" as const },
          ];

          // The same two calls the route makes. Measuring the document call alone would
          // measure a request the product never sends, and would hide the selection cost
          // that every draft now pays.
          const selection = await selector.generate({
            maxOutputTokens: MAX_SELECTION_OUTPUT_TOKENS,
            messages,
            outputSchema: buildSectionSelectionSchema(document, manifest),
            systemPrompt: sectionSelectionSystemPrompt(document, manifest),
          });

          const sections = resolveSectionSelection(selection.output, document, manifest);
          selectionTally.inputTokens += selection.usage.inputTokens;
          selectionTally.outputTokens += selection.usage.outputTokens;
          console.info(`${model} · ${fixture.name} — sections: ${sections.join(", ") || "none"}`);

          if (sections.length === 0) {
            tally.failures.push(`${fixture.name}: named no sections`);
            continue;
          }

          const generation = await provider.generate({
            maxOutputTokens: MAX_DOCUMENT_OUTPUT_TOKENS,
            messages,
            outputSchema: buildProposalSchema(document, manifest, sections),
            systemPrompt: documentSystemPrompt(document, manifest, sections),
          });

          // Kept in three buckets rather than one total. They are billed at three different
          // rates, and collapsing them would hide whether the prefix cached at all — which
          // is the second thing this run is here to find out.
          tally.cacheReadTokens += generation.usage.cacheReadInputTokens;
          tally.cacheWriteTokens += generation.usage.cacheWriteInputTokens;
          tally.inputTokens += generation.usage.inputTokens;
          tally.outputTokens += generation.usage.outputTokens;

          console.info(
            `${model} · ${fixture.name} — in ${generation.usage.inputTokens} · cacheWrite ${generation.usage.cacheWriteInputTokens} · cacheRead ${generation.usage.cacheReadInputTokens} · out ${generation.usage.outputTokens} · stop ${generation.stopReason}`,
          );

          const proposal = resolveDocumentProposal(generation.output, document, manifest);

          if (proposal.status === "proposed") {
            tally.passed += 1;
            console.info(`\n--- ${model} · ${fixture.name} ---`);
            console.info(`expected: ${fixture.expectation}`);
            console.info(JSON.stringify(proposal.details, null, 1));
          } else {
            tally.failures.push(`${fixture.name}: ${proposal.reason}`);
            // Printed in full, because "invalid_document" names the gate that refused and
            // not the field that broke — and the route deliberately cannot say more, since
            // a hallucinated draft is not evidence a creator can use. Safe to print here
            // and only here: every name, venue, and date in these fixtures is invented.
            console.info(`  rejected — ${proposal.reason}`);
            console.info(JSON.stringify(generation.output, null, 1));
          }
        } catch (error) {
          // Printed as it happens, not only in the summary. A run that throws on every
          // fixture is a broken harness rather than a poor model, and waiting fifteen
          // minutes to find that out is fifteen minutes and eighteen billed calls wasted.
          const cause = error instanceof Error ? error.cause : undefined;
          const detail = `${error instanceof Error ? error.message : "unknown"}${cause ? ` — ${String(cause)}` : ""}`;
          tally.failures.push(`${fixture.name}: threw — ${detail}`);
          console.info(`${model} · ${fixture.name} — threw: ${detail}`);
        }
      }
    }

    console.info("\n=== schema-pass rate and measured cost ===");
    for (const [model, tally] of tallies) {
      const rate = RATES[model];
      // Cache writes cost 1.25x input and cache reads 0.1x, so the three buckets are priced
      // apart rather than summed.
      const usd = rate
        ? ((tally.inputTokens + tally.cacheWriteTokens * 1.25 + tally.cacheReadTokens * 0.1) *
            rate.input +
            tally.outputTokens * rate.output) /
          1_000_000
        : Number.NaN;

      console.info(
        `${model}: ${tally.passed}/${tally.total} · input ${tally.inputTokens} · cacheWrite ${tally.cacheWriteTokens} · cacheRead ${tally.cacheReadTokens} · output ${tally.outputTokens} · $${usd.toFixed(4)} total · $${(usd / tally.total).toFixed(4)} per document turn`,
      );
      for (const failure of tally.failures) console.info(`    failed — ${failure}`);
    }
    const selectionRate = RATES[ASSISTANT_SELECTION_MODEL];
    const selectionUsd = selectionRate
      ? (selectionTally.inputTokens * selectionRate.input +
          selectionTally.outputTokens * selectionRate.output) /
        1_000_000
      : Number.NaN;
    const selectionCalls = CANDIDATE_MODELS.length * DOCUMENT_PROMPT_FIXTURES.length;

    console.info(
      `section selection on ${ASSISTANT_SELECTION_MODEL}: input ${selectionTally.inputTokens} · output ${selectionTally.outputTokens} · $${(selectionUsd / selectionCalls).toFixed(4)} per document turn, on top of whichever model drafts`,
    );
    console.info(
      "\nSet ASSISTANT_DOCUMENT_MODEL in src/server/assistant/claude.ts from this evidence. A cacheRead of 0 across every model means the per-template prefix never reached the minimum cacheable length, not that caching is off.",
    );

    // The run's job is to produce evidence, not a verdict. It fails only if it collected
    // none, which would mean the harness itself is broken rather than a model being poor.
    expect([...tallies.values()].every((tally) => tally.total > 0)).toBe(true);
  });
});

describe("the document fixture set", () => {
  it("covers every production occasion a creator can draft into", () => {
    const covered = new Set(DOCUMENT_PROMPT_FIXTURES.map((fixture) => fixture.templateId));
    expect([...covered].sort()).toEqual([
      "a-little-question",
      "garden-promise",
      "golden-hour",
      "little-blessings",
      "sunday-joy",
    ]);
  });

  it("names a template that exists, so the comparison cannot silently skip one", () => {
    for (const fixture of DOCUMENT_PROMPT_FIXTURES) {
      expect(() => resolveTemplateById(fixture.templateId)).not.toThrow();
    }
  });

  it("includes Taglish input and instruction-shaped input", () => {
    const prompts = DOCUMENT_PROMPT_FIXTURES.map((fixture) => fixture.prompt).join(" ");
    expect(prompts).toContain("ninong at ninang");
    expect(prompts).toContain("Ignore all previous instructions");
  });
});
