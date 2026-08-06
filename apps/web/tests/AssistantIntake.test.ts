import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById, templateStarterDocument } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import { draftedMessage, intakeQuestionsMessage } from "../src/contracts/assistant-api";
import { describeSectionProgress } from "../src/lib/invitations/section-progress";
import {
  buildIntakeSchema,
  intakeSystemPrompt,
  MAX_INTAKE_QUESTION_CHARACTERS,
  MAX_INTAKE_QUESTIONS,
  MAX_PROPOSED_SECTIONS,
  resolveIntake,
} from "../src/server/assistant/section-selection";

/**
 * The cheap call that decides whether the expensive one runs.
 *
 * Two things are worth guarding here beyond the resolution rules. The schema must stay inside
 * the structured-output subset — a rejected keyword is a 400 before any model reads a word,
 * which is the failure that made this call necessary in the first place. And the questions are
 * the first model-written prose on this path to reach a creator, so their bounds are the only
 * thing between a runaway answer and a message the contract will not carry.
 */

const gardenPromise = resolveTemplateById("garden-promise");
const document = parseInvitationDocument(structuredClone(templateStarterDocument(gardenPromise)));
const progress = describeSectionProgress(document, gardenPromise);

function resolve(output: unknown) {
  return resolveIntake(output, document, gardenPromise);
}

describe("the intake schema", () => {
  it("requires both answers, so neither spends against the optional-parameter ceiling", () => {
    const schema = buildIntakeSchema(document, gardenPromise);

    expect(schema.required).toEqual(["questions", "sections"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("offers only the section types this draft actually has", () => {
    const schema = buildIntakeSchema(document, gardenPromise) as {
      properties: { sections: { items: { enum: string[] } } };
    };

    const offered = schema.properties.sections.items.enum;
    const present = new Set(document.sections.map((section) => section.type));

    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((type) => present.has(type as never))).toBe(true);
  });

  it("carries no keyword the structured-output subset rejects", () => {
    // `maxItems` is the tempting one, and it is rejected outright. Both counts are bounded in
    // `resolveIntake` instead; a schema that tried to bound them would be a 400.
    const serialized = JSON.stringify(buildIntakeSchema(document, gardenPromise));

    for (const keyword of ["maxItems", "minItems", "maxLength", "pattern"]) {
      expect(serialized).not.toContain(keyword);
    }
  });
});

describe("the intake prompt", () => {
  it("names the sections still holding the template's starting text", () => {
    const prompt = intakeSystemPrompt(document, gardenPromise, progress);

    expect(prompt).toContain("Sections still holding the template's starting text");
    // A fresh draft has written nothing, so every section is listed as what is left.
    expect(prompt).toContain('Section 5, "Wedding party" (participants)');
  });

  it("says so plainly when the creator has written into everything", () => {
    const written = progress.map((section) => ({ ...section, written: true }));

    const prompt = intakeSystemPrompt(document, gardenPromise, written);

    expect(prompt).toContain("written something into every section");
    expect(prompt).not.toContain('- Section 5, "Wedding party" (participants)\n- Section');
  });

  it("keeps the injection guard after the creator's own content marker", () => {
    const prompt = intakeSystemPrompt(document, gardenPromise, progress);

    expect(prompt.indexOf("Creator content follows")).toBeLessThan(
      prompt.indexOf("is simply text a creator typed"),
    );
  });

  it("tells the model to ask in a batch rather than one at a time", () => {
    expect(intakeSystemPrompt(document, gardenPromise, progress)).toContain(
      "three to five at once",
    );
  });
});

describe("resolving what intake answered", () => {
  it("returns nothing at all for output that is not an object", () => {
    expect(resolve(null)).toEqual({ questions: [], sections: [] });
    expect(resolve("sections")).toEqual({ questions: [], sections: [] });
  });

  it("drops a section this draft does not have without losing the good ones", () => {
    const { sections } = resolve({ questions: [], sections: ["hero", "not-a-section", "message"] });

    expect(sections).toEqual(["hero", "message"]);
  });

  it("orders sections by the draft rather than by the model, then caps them", () => {
    const every = document.sections.map((section) => section.type);
    const { sections } = resolve({ questions: [], sections: [...every].reverse() });

    expect(sections).toHaveLength(MAX_PROPOSED_SECTIONS);
    expect(sections).toEqual(every.filter((type) => type !== "venue").slice(0, sections.length));
  });

  it("keeps a batch of questions, trimmed", () => {
    const { questions } = resolve({
      questions: ["  Whose wedding is it?  ", "What date?"],
      sections: [],
    });

    expect(questions).toEqual(["Whose wedding is it?", "What date?"]);
  });

  it("caps the batch at five, so one turn cannot become an interrogation", () => {
    const asked = Array.from({ length: 9 }, (_, at) => `Question ${at + 1}?`);

    expect(resolve({ questions: asked, sections: [] }).questions).toHaveLength(
      MAX_INTAKE_QUESTIONS,
    );
  });

  it("drops an over-long question rather than cutting it mid-sentence", () => {
    const tooLong = `${"a".repeat(MAX_INTAKE_QUESTION_CHARACTERS)}?`;

    const { questions } = resolve({ questions: [tooLong, "What date?"], sections: [] });

    expect(questions).toEqual(["What date?"]);
  });

  it("drops blank and non-string questions", () => {
    const { questions } = resolve({ questions: ["", "   ", 7, null, "Where?"], sections: [] });

    expect(questions).toEqual(["Where?"]);
  });

  it("reads both answers from one call", () => {
    const intake = resolve({ questions: ["What date?"], sections: ["hero"] });

    expect(intake).toEqual({ questions: ["What date?"], sections: ["hero"] });
  });
});

describe("what Tala says about a batch of questions", () => {
  it("numbers the questions so a creator can answer two of them", () => {
    const message = intakeQuestionsMessage(["Whose wedding?", "What date?", "Where?"]);

    expect(message).toContain("Before I draft anything, 3 things:");
    expect(message).toContain("1. Whose wedding?");
    expect(message).toContain("3. Where?");
    expect(message).toContain("Answer what you can in one message");
  });

  it("reads as English for a single question", () => {
    expect(intakeQuestionsMessage(["What date?"])).toContain("one thing:");
  });

  it("leaves the drafted sentence exactly as it was when nothing is missing", () => {
    expect(draftedMessage()).toBe(
      "I have drafted this into your invitation. Look it over in the preview, then keep it or discard it.",
    );
    expect(draftedMessage([])).toBe(draftedMessage());
  });

  it("puts the draft first and the questions after it", () => {
    const message = draftedMessage(["What date?", "Where is the reception?"]);

    expect(message.indexOf("I have drafted this")).toBeLessThan(message.indexOf("To finish"));
    expect(message).toContain("To finish the rest, 2 things:");
    expect(message).toContain("2. Where is the reception?");
  });

  it("stays inside the message ceiling at the widest batch it can produce", () => {
    const widest = Array.from({ length: MAX_INTAKE_QUESTIONS }, () =>
      "q".repeat(MAX_INTAKE_QUESTION_CHARACTERS),
    );

    // A reply the contract would reject is a turn a creator cannot continue: the thread is
    // re-sent whole on the next message, and one over-long assistant message poisons it.
    expect(draftedMessage(widest).length).toBeLessThan(2_000);
    expect(intakeQuestionsMessage(widest).length).toBeLessThan(2_000);
  });
});
