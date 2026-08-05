import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById, templateStarterDocument } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import { createClaudeProvider } from "../src/server/assistant/claude";
import {
  currentDraftMessage,
  documentSystemPrompt,
  MAX_DOCUMENT_OUTPUT_TOKENS,
} from "../src/server/assistant/document-prompt";
import { resolveDocumentProposal } from "../src/server/assistant/document-proposal";
import { buildProposalSchema } from "../src/server/assistant/document-schema";
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

const CANDIDATE_MODELS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"] as const;

const enabled =
  process.env.ASSISTANT_MODEL_COMPARISON === "1" && Boolean(process.env.ANTHROPIC_API_KEY);

interface Tally {
  failures: string[];
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

    for (const model of CANDIDATE_MODELS) {
      const tally: Tally = {
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
          const generation = await provider.generate({
            maxOutputTokens: MAX_DOCUMENT_OUTPUT_TOKENS,
            messages: [
              { content: currentDraftMessage(document), role: "user" },
              { content: fixture.prompt, role: "user" },
            ],
            outputSchema: buildProposalSchema(document, manifest),
            systemPrompt: documentSystemPrompt(document, manifest),
          });

          tally.inputTokens += generation.usage.inputTokens + generation.usage.cacheReadInputTokens;
          tally.outputTokens += generation.usage.outputTokens;

          const proposal = resolveDocumentProposal(generation.output, document, manifest);

          if (proposal.status === "proposed") {
            tally.passed += 1;
            console.info(`\n--- ${model} · ${fixture.name} ---`);
            console.info(`expected: ${fixture.expectation}`);
            console.info(JSON.stringify(proposal.details, null, 1));
          } else {
            tally.failures.push(`${fixture.name}: ${proposal.reason}`);
          }
        } catch (error) {
          tally.failures.push(
            `${fixture.name}: threw — ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      }
    }

    console.info("\n=== schema-pass rate ===");
    for (const [model, tally] of tallies) {
      console.info(
        `${model}: ${tally.passed}/${tally.total} · input ${tally.inputTokens} · output ${tally.outputTokens}`,
      );
      for (const failure of tally.failures) console.info(`    failed — ${failure}`);
    }
    console.info(
      "\nMultiply the token totals by the model's published per-million rates for cost per document turn, then set ASSISTANT_DOCUMENT_MODEL in src/server/assistant/claude.ts from this evidence.",
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
