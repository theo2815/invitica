import { parseInvitationDocument } from "@invitica/invitation-schema";
import { templateRegistry } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import {
  describeInvitationSections,
  isSectionKey,
  resolveEditorProfile,
  SECTION_ORDER,
} from "../src/lib/invitations/section-vocabulary";

/**
 * The numbers and names Invi uses have to be the ones on the creator's own section cards.
 *
 * The editor derives both the same way this module does, from the document's section order and
 * the template's profile. Nothing enforces that they stay in step except this file: the two
 * were one object until 2026-08-06, and splitting them is what created the room to drift. A
 * failure here means Invi would answer confidently about a different section than the creator
 * is looking at, which is worse than not knowing the numbering at all.
 */

const sectionDocumentTemplates = templateRegistry.filter(
  (template) => template.editorKey === "section-document-v1",
);

describe("the creator's section vocabulary", () => {
  it("covers every section-document production template", () => {
    expect(sectionDocumentTemplates.length).toBeGreaterThan(0);
  });

  it.each(
    sectionDocumentTemplates.map((template) => [template.rendererKey, template] as const),
  )("numbers %s from the document, the way the editor's section cards do", (_rendererKey, template) => {
    const document = parseInvitationDocument(template.starterDocument ?? template.defaultDocument);

    // Exactly what `LittleBlessingsDraftEditor` computes for `sectionOrder`, then numbers
    // with `position + 1`.
    const expected = document.sections
      .map((section) => section.type)
      .filter(isSectionKey)
      .map((type, index) => ({ position: index + 1, type }));

    const described = describeInvitationSections(document, template.rendererKey).map(
      ({ position, type }) => ({ position, type }),
    );

    expect(described).toEqual(expected);
  });

  it.each(
    sectionDocumentTemplates.map((template) => [template.rendererKey, template] as const),
  )("gives every %s section the title its own editor profile uses", (_rendererKey, template) => {
    const document = parseInvitationDocument(template.starterDocument ?? template.defaultDocument);
    const { sectionNames } = resolveEditorProfile(template.rendererKey);

    for (const section of describeInvitationSections(document, template.rendererKey)) {
      expect(section.name).toBe(sectionNames[section.type]);
      expect(section.name.length).toBeGreaterThan(0);
    }
  });

  it("names Garden Promise's fifth section the way the founder's creators read it", () => {
    const gardenPromise = sectionDocumentTemplates.find(
      (template) => template.rendererKey === "garden-promise-v2",
    );
    if (!gardenPromise) throw new Error("Garden Promise v2 is not registered.");

    const document = parseInvitationDocument(
      gardenPromise.starterDocument ?? gardenPromise.defaultDocument,
    );
    const fifth = describeInvitationSections(document, gardenPromise.rendererKey).find(
      (section) => section.position === 5,
    );

    // The worked example from the task note. If the template's section order changes this
    // should be updated deliberately, not deleted.
    expect(fifth).toMatchObject({ name: "Wedding party", type: "participants" });
  });

  it("counts a hidden section, because its card is still numbered on screen", () => {
    const sundayJoy = sectionDocumentTemplates.find(
      (template) => template.rendererKey === "sunday-joy-v2",
    );
    if (!sundayJoy) throw new Error("Sunday Joy v2 is not registered.");

    const document = parseInvitationDocument(
      sundayJoy.starterDocument ?? sundayJoy.defaultDocument,
    );
    const described = describeInvitationSections(document, sundayJoy.rendererKey);
    const hidden = described.filter((section) => !section.visible);

    expect(hidden.length).toBeGreaterThan(0);
    expect(described.map((section) => section.position)).toEqual(
      described.map((_section, index) => index + 1),
    );
  });

  it("keeps RSVP last in the curated order", () => {
    expect(SECTION_ORDER.at(-1)).toBe("rsvp");
  });
});
