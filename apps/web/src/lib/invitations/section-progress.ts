import type { InvitationDocument } from "@invitica/invitation-schema";
import type { TemplateManifest } from "@invitica/template-kit";

import { describeInvitationSections, type NumberedSection } from "./section-vocabulary";

/**
 * Which sections a creator has written, and which still hold the words their template
 * shipped with.
 *
 * Free, and deliberately so. Guiding a creator from Section 1 to Section 11 means knowing
 * what is left before asking about it, and asking a model "what has this creator filled in?"
 * would spend a billed call to learn something the two documents already state between them.
 * It is also the only version of this that cannot be wrong: a diff either matches or it does
 * not, where a model's opinion about whether a heading counts as written is a guess a creator
 * has to catch.
 *
 * A new draft is created from the template's `starterDocument`, so at that moment every
 * section matches and nothing is written. Each field the creator edits moves one section
 * across.
 */

/** One section as the creator's editor lists it, plus whether they have written into it. */
export interface SectionProgress extends NumberedSection {
  /** False while this section still holds exactly the text the template started it with. */
  written: boolean;
}

/**
 * Structural equality over parsed section props.
 *
 * `JSON.stringify` would be shorter and wrong: one side is a literal in a template manifest
 * and the other has been through the database and a schema parse, so the two can carry the
 * same fields in a different key order and compare unequal. That failure is silent and it
 * points the wrong way — every section would read as written, and the guided flow would ask
 * about nothing.
 */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;

  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return left.length === right.length && left.every((entry, at) => sameValue(entry, right[at]));
  }

  const leftEntries = Object.entries(left as Record<string, unknown>);
  const rightRecord = right as Record<string, unknown>;

  if (leftEntries.length !== Object.keys(rightRecord).length) return false;

  return leftEntries.every(
    ([key, value]) => Object.hasOwn(rightRecord, key) && sameValue(value, rightRecord[key]),
  );
}

/**
 * The creator's section list, numbered by their own editor, each one marked written or not.
 *
 * Numbering comes from `describeInvitationSections` rather than being recomputed here, so the
 * checklist cannot drift from the number printed on the section card or from the number Tala
 * uses when it names a section.
 *
 * `starterDocument` is optional on a manifest, and `defaultDocument` is what a draft is built
 * from when it is absent — comparing against the wrong one would mark a whole invitation
 * written on the day it was created.
 */
export function describeSectionProgress(
  document: InvitationDocument,
  manifest: TemplateManifest,
): SectionProgress[] {
  const starter = manifest.starterDocument ?? manifest.defaultDocument;
  const startingProps = new Map(starter.sections.map((section) => [section.type, section.props]));
  const currentProps = new Map(document.sections.map((section) => [section.type, section.props]));

  return describeInvitationSections(document, manifest.rendererKey).map((section) => {
    const starting = startingProps.get(section.type);

    return {
      ...section,
      // A section the template never started has no starting text to still be holding. Absence
      // of evidence is not evidence of template text, and the expensive mistake is the other
      // one: telling a creator to write a section they already wrote.
      written: starting === undefined || !sameValue(currentProps.get(section.type), starting),
    };
  });
}

/** How many of a creator's sections still hold the template's starting text. */
export function countUnwrittenSections(sections: readonly SectionProgress[]): number {
  return sections.filter((section) => !section.written).length;
}

export type { NumberedSection };
