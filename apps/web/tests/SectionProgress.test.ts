import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById, templateStarterDocument } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import {
  countUnwrittenSections,
  describeSectionProgress,
} from "../src/lib/invitations/section-progress";
import { describeInvitationSections } from "../src/lib/invitations/section-vocabulary";

/**
 * The free half of guided drafting.
 *
 * Everything here has to hold without a model, because the whole point of computing progress
 * from two documents is that no model is involved and the answer cannot be a guess. What these
 * tests guard is the other side of that bargain: a diff that is silently always-true would tell
 * every creator their invitation is finished, and nothing at runtime would complain.
 */

const gardenPromise = resolveTemplateById("garden-promise");
const littleBlessings = resolveTemplateById("little-blessings");

function freshDraft(manifest: typeof gardenPromise) {
  return parseInvitationDocument(structuredClone(templateStarterDocument(manifest)));
}

describe("section progress", () => {
  it("marks every section unwritten on a draft that has just been created", () => {
    const progress = describeSectionProgress(freshDraft(gardenPromise), gardenPromise);

    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((section) => !section.written)).toBe(true);
    expect(countUnwrittenSections(progress)).toBe(progress.length);
  });

  it("marks only the edited section written, and leaves its neighbours alone", () => {
    const document = freshDraft(gardenPromise);
    const hero = document.sections.find((section) => section.type === "hero");
    if (hero?.type !== "hero") throw new Error("The fixture has no hero section.");

    hero.props.title = "Amihan and Rafael";

    const progress = describeSectionProgress(document, gardenPromise);
    const written = progress.filter((section) => section.written);

    expect(written).toHaveLength(1);
    expect(written[0]?.type).toBe("hero");
    expect(countUnwrittenSections(progress)).toBe(progress.length - 1);
  });

  it("numbers sections exactly as the creator's editor numbers them", () => {
    const document = freshDraft(gardenPromise);

    const progress = describeSectionProgress(document, gardenPromise);
    const editor = describeInvitationSections(document, gardenPromise.rendererKey);

    expect(progress.map((section) => [section.position, section.name, section.type])).toEqual(
      editor.map((section) => [section.position, section.name, section.type]),
    );
  });

  it("compares by structure rather than by serialization, so key order cannot mark a section written", () => {
    const document = freshDraft(littleBlessings);
    const hero = document.sections.find((section) => section.type === "hero");
    if (hero?.type !== "hero") throw new Error("The fixture has no hero section.");

    // Same fields, same values, rebuilt in reverse key order — which is exactly what a round
    // trip through the database can produce. A `JSON.stringify` comparison calls this changed.
    const reversed = Object.fromEntries(Object.entries(hero.props).reverse());
    hero.props = reversed as typeof hero.props;

    const progress = describeSectionProgress(document, littleBlessings);

    expect(progress.find((section) => section.type === "hero")?.written).toBe(false);
  });

  it("counts a hidden section, and reports it as hidden rather than as written", () => {
    const document = freshDraft(gardenPromise);
    const gifts = document.sections.find((section) => section.type === "gifts");
    if (!gifts) throw new Error("The fixture has no gifts section.");

    gifts.visible = false;

    const progress = describeSectionProgress(document, gardenPromise);
    const entry = progress.find((section) => section.type === "gifts");

    // Visibility is a switch on a card that still exists. Hiding a section is not writing it,
    // and it must not quietly drop out of the count of what is left.
    expect(entry?.visible).toBe(false);
    expect(entry?.written).toBe(false);
    expect(progress).toHaveLength(
      describeInvitationSections(document, gardenPromise.rendererKey).length,
    );
  });

  it("treats a section the template never started as written rather than as untouched", () => {
    const document = freshDraft(littleBlessings);
    const starter = templateStarterDocument(littleBlessings);
    const missing = document.sections[1]?.type;
    if (!missing) throw new Error("The fixture has too few sections.");

    const manifest = {
      ...littleBlessings,
      defaultDocument: {
        ...starter,
        sections: starter.sections.filter((section) => section.type !== missing),
      },
      starterDocument: undefined,
    };

    const progress = describeSectionProgress(document, manifest);

    // No starting text to still be holding. The costly mistake is the other one — telling a
    // creator to write a section they already wrote.
    expect(progress.find((section) => section.type === missing)?.written).toBe(true);
  });

  it("falls back to the default document when a template declares no starter", () => {
    const manifest = { ...littleBlessings, starterDocument: undefined };
    const document = parseInvitationDocument(structuredClone(manifest.defaultDocument));

    const progress = describeSectionProgress(document, manifest);

    // Comparing against the wrong document would mark a whole invitation written on the day
    // it was created, and the guided flow would have nothing left to guide.
    expect(progress.every((section) => !section.written)).toBe(true);
  });

  it("reports nothing left once every section differs from the starting text", () => {
    const document = freshDraft(littleBlessings);
    // A probe rather than eleven realistic edits: the sections have eleven different shapes
    // and this assertion is about the count, not about any one field. The realistic single
    // edit is covered above.
    for (const section of document.sections) {
      (section.props as Record<string, unknown>).progressProbe = "changed";
    }

    expect(countUnwrittenSections(describeSectionProgress(document, littleBlessings))).toBe(0);
  });
});
