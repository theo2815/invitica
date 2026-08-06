// @vitest-environment node
//
// Node, not the suite's default jsdom: the Anthropic SDK refuses to construct a client in a
// browser-like environment because a key there would be shipped to the user.

import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById, templateStarterDocument } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import { describeSectionProgress } from "../src/lib/invitations/section-progress";
import { ASSISTANT_SELECTION_MODEL, createClaudeProvider } from "../src/server/assistant/claude";
import { currentDraftMessage } from "../src/server/assistant/document-prompt";
import { helpContextMessage } from "../src/server/assistant/help-context";
import { HELP_SYSTEM_PROMPT, MAX_OUTPUT_TOKENS } from "../src/server/assistant/prompt";
import {
  buildIntakeSchema,
  intakeSystemPrompt,
  MAX_INTAKE_OUTPUT_TOKENS,
  resolveIntake,
} from "../src/server/assistant/section-selection";

/**
 * The success criteria of [[TASK/2026-08-06 - Tala Guidance and Template Awareness]], run against
 * the real model.
 *
 * Every other test on this path stubs the provider, and **a stub cannot show the defect this task
 * exists to fix.** The founder reported Tala refusing "Can you help me create my first invitation?"
 * — a question the corpus answers — and no amount of stubbed coverage could reproduce that, because
 * the refusal was a decision the model made about a prompt. This file exercises the exact prompts,
 * context message, and schema the routes build, and asks the model what it does with them.
 *
 * **This makes real, billed API calls** — four of them, roughly a cent — so it is gated exactly as
 * `AssistantHelpCacheProof` and `AssistantDocumentModelComparison` are, and `pnpm check` never
 * spends money.
 *
 *     ASSISTANT_MODEL_COMPARISON=1 ANTHROPIC_API_KEY=sk-... \
 *       pnpm --filter @invitica/web exec vitest run tests/AssistantGuidanceLiveCheck.test.ts \
 *       --disable-console-intercept
 *
 * **Read `Operations/Known Environment Issues` before running.** An exported shell
 * `ANTHROPIC_API_KEY` overrides the one in `.env.local`, and a stale export produces a 401 that
 * looks exactly like a broken feature.
 *
 * What it does not cover: the route wiring, the budget, and auth. Those are stubbed elsewhere and
 * are well covered there. What is asserted here is model behavior and nothing else, deliberately
 * loosely — an assertion tight enough to pin the model's wording would fail on a rephrase that is
 * still a correct answer.
 */

const enabled =
  process.env.ASSISTANT_MODEL_COMPARISON === "1" && Boolean(process.env.ANTHROPIC_API_KEY);

const gardenPromise = resolveTemplateById("garden-promise");
const gardenDocument = parseInvitationDocument(
  structuredClone(templateStarterDocument(gardenPromise)),
);

/** Words that only appear when Tala has taken the refusal branch. */
const REFUSALS = [
  "i cannot",
  "i can't",
  "i am not able",
  "i'm not able",
  "i do not have the ability",
  "unable to",
];

async function askHelp(question: string, context: null | string): Promise<string> {
  const provider = createClaudeProvider();
  let answer = "";

  for await (const event of provider.stream({
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    messages: [
      ...(context ? [{ content: context, role: "user" as const }] : []),
      { content: question, role: "user" as const },
    ],
    systemPrompt: HELP_SYSTEM_PROMPT,
  })) {
    if (event.type === "text") answer += event.text;
  }

  return answer;
}

async function askIntake(message: string) {
  const provider = createClaudeProvider(ASSISTANT_SELECTION_MODEL);

  const generation = await provider.generate({
    maxOutputTokens: MAX_INTAKE_OUTPUT_TOKENS,
    messages: [
      { content: currentDraftMessage(gardenDocument), role: "user" },
      { content: message, role: "user" },
    ],
    outputSchema: buildIntakeSchema(gardenDocument, gardenPromise),
    systemPrompt: intakeSystemPrompt(
      gardenDocument,
      gardenPromise,
      describeSectionProgress(gardenDocument, gardenPromise),
    ),
  });

  return resolveIntake(generation.output, gardenDocument, gardenPromise);
}

describe.runIf(enabled)("Tala against the real model", () => {
  it("guides a creator with no invitations instead of refusing the reported question", {
    timeout: 120_000,
  }, async () => {
    // The exact question the founder reported, with the exact context the route now sends for a
    // creator who has not made an invitation yet.
    const answer = await askHelp(
      "Can you help me create my first invitation?",
      helpContextMessage({
        hasInvitations: false,
        mode: "help",
        surface: "Overview",
      }),
    );

    console.info(`\n=== "Can you help me create my first invitation?" ===\n${answer}\n`);

    const lowered = answer.toLowerCase();
    for (const refusal of REFUSALS) {
      expect(lowered, `answered with a refusal: "${refusal}"`).not.toContain(refusal);
    }

    // Guidance means naming where the creator goes and what they do there. Templates is the
    // first step in `getting-started.ts`, and it is the step the context says is in front of them.
    expect(lowered).toContain("template");
  });

  it("names the creator's own tabs when asked what it can do", { timeout: 120_000 }, async () => {
    // Before `content/help/assistant.ts` the corpus described Tala only in terms of what it could
    // not do, so this answer was not sayable at all.
    const answer = await askHelp(
      "What can you help me with?",
      helpContextMessage({ hasInvitations: true, mode: "help", surface: "the full Tala page" }),
    );

    console.info(`\n=== "What can you help me with?" ===\n${answer}\n`);

    const lowered = answer.toLowerCase();
    expect(lowered).toContain("draft");
    expect(lowered).toContain("guest list");
  });

  it('resolves "Section 5" to Garden Promise\'s Wedding party and nothing else', {
    timeout: 120_000,
  }, async () => {
    const intake = await askIntake("Help me improve Section 5");

    console.info(
      `\n=== "Help me improve Section 5" ===\nsections: ${intake.sections.join(", ") || "none"}\nquestions: ${intake.questions.length}\n`,
    );

    // The number is the creator's, from their own editor. Garden Promise numbers `participants`
    // fifth and calls it Wedding party.
    expect(intake.sections).toEqual(["participants"]);
  });

  /**
   * **Known open, 2026-08-06. This case fails, and the assertion is the intended bar rather than
   * current behavior** — it is kept as a reproduction, not as a passing check.
   *
   * Observed across four runs of the same prompt: sometimes no sections and three questions,
   * sometimes two or three sections and two questions. Unstable, and the questions it does ask are
   * about the gift list and the album rather than who is getting married.
   *
   * The cause is not the wording of this prompt. `currentDraftMessage` sends the whole document as
   * "my invitation as it stands today", and a starter document is derived from the template's
   * showcase — `gardenPromiseV2StarterSections` in `packages/template-kit/.../v2.ts` — so it carries
   * a complete sample wedding with plausible names, a date, and a church. The model reads real
   * content and correctly concludes nothing is missing, then reaches for the only two sections that
   * *look* unfinished: the hidden album and the one-item gift list. Telling it in this prompt that
   * the content is a placeholder does not beat the content itself.
   *
   * The structural fix is to stop presenting template sample text as the creator's own words in
   * `currentDraftMessage`. That message is shared with the drafting call, so it is a change with
   * real blast radius and it is a founder decision rather than a prompt tweak.
   */
  it("asks a batch of questions rather than drafting from a description with no facts in it", {
    timeout: 120_000,
  }, async () => {
    const intake = await askIntake("help me with my invitation");

    console.info(
      `\n=== "help me with my invitation" ===\nsections: ${intake.sections.join(", ") || "none"}\nquestions:\n${intake.questions.map((q, at) => `  ${at + 1}. ${q}`).join("\n") || "  none"}\n`,
    );

    // Naming no sections is what stops the expensive call from running at all, which is the
    // whole economy of Stage C: the vague request becomes cheaper than it was, not dearer.
    expect(intake.sections).toEqual([]);
    expect(intake.questions.length).toBeGreaterThanOrEqual(3);
    expect(intake.questions.length).toBeLessThanOrEqual(5);
  });
});
