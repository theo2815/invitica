import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import { describeProposalChanges } from "../src/lib/invitations/proposal-diff";
import { resolveDocumentProposal } from "../src/server/assistant/document-proposal";
import {
  buildProposalSchema,
  countSchemaParameters,
  MAX_OPTIONAL_PARAMETERS,
  MAX_UNION_PARAMETERS,
  proposableSections,
} from "../src/server/assistant/document-schema";

const littleBlessings = resolveTemplateById("little-blessings");
const document = parseInvitationDocument(structuredClone(littleBlessings.defaultDocument));

function section<Type extends string>(type: Type) {
  const found = document.sections.find((candidate) => candidate.type === type);
  if (!found) throw new Error(`The fixture has no ${type} section.`);
  return found;
}

function propose(entries: Record<string, unknown>) {
  return resolveDocumentProposal(entries, document, littleBlessings);
}

describe("the proposal schema offered to the model", () => {
  const schema = buildProposalSchema(document, littleBlessings);
  const serialized = JSON.stringify(schema);

  it("offers only sections this draft actually contains", () => {
    const offered = Object.keys(
      (schema as { properties: Record<string, unknown> }).properties,
    ).sort();
    expect(offered).toEqual([...proposableSections(document, littleBlessings)].sort());
    // Present in the section-document contract, absent from this template.
    expect(offered).not.toContain("venue");
  });

  it("never lets the model name a photograph, a portrait, or a map pin", () => {
    expect(serialized).not.toContain("imageAssetId");
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("longitude");
    // The gallery's words stay proposable; its pictures do not.
    expect(serialized).toContain("gallery");
    expect(serialized).not.toContain('"images"');
  });

  it("carries no keyword the structured-output subset would reject", () => {
    for (const keyword of [
      "maxLength",
      "minLength",
      "minItems",
      "maxItems",
      "pattern",
      "$schema",
    ]) {
      expect(serialized).not.toContain(keyword);
    }
  });

  it("lets a section be left alone by naming it null, and requires the model to say so", () => {
    const top = schema as { properties: Record<string, unknown>; required: string[] };

    // Required at the top level but nullable: the model has to make a decision about every
    // section rather than fall silent about one, and `null` is how it says "leave this".
    expect(top.required.sort()).toEqual([...proposableSections(document, littleBlessings)].sort());
    for (const entry of Object.values(top.properties)) {
      expect(entry).toHaveProperty("anyOf");
      expect((entry as { anyOf: unknown[] }).anyOf).toContainEqual({ type: "null" });
    }
  });

  it("stays under both of the provider's schema ceilings on every production template", () => {
    // Neither ceiling is documented anywhere we can read; both were found by a 400 in a
    // live run, and before they were, four of the five occasions could not be drafted at
    // all. They also trade against each other — making a field nullable moves it from one
    // budget to the other — so both are asserted together or neither means anything.
    for (const id of [
      "a-little-question",
      "garden-promise",
      "golden-hour",
      "little-blessings",
      "sunday-joy",
    ]) {
      const manifest = resolveTemplateById(id);
      const draft = parseInvitationDocument(structuredClone(manifest.defaultDocument));
      const counted = countSchemaParameters(buildProposalSchema(draft, manifest));
      const spent = `${id} spends ${counted.optional} optional and ${counted.union} union parameters`;

      expect(counted.optional, spent).toBeLessThanOrEqual(MAX_OPTIONAL_PARAMETERS);
      expect(counted.union, spent).toBeLessThanOrEqual(MAX_UNION_PARAMETERS);
    }
  });

  it("never asks the model for a colour, a map link, or an RSVP mode it did not choose", () => {
    // Each of these is the creator's: two they picked in the editor, one they chose with
    // the template. All three are carried from the draft instead of proposed.
    expect(serialized).not.toContain("mapUrl");
    expect(serialized).not.toContain("colors");
    expect(serialized).not.toContain("responseMode");
  });
});

describe("resolving what the model returned", () => {
  it("accepts a proposal that satisfies the invitation contract", () => {
    const hero = section("hero");
    const outcome = propose({
      hero: { props: { ...hero.props, title: "Amihan Reyes" }, visible: true },
    });

    expect(outcome.status).toBe("proposed");
    if (outcome.status !== "proposed") return;
    const proposedHero = outcome.document.sections.find((entry) => entry.type === "hero");
    expect(proposedHero?.type === "hero" && proposedHero.props.title).toBe("Amihan Reyes");
  });

  it("puts the creator's portrait back even though the model could not name it", () => {
    const hero = section("hero");
    if (hero.type !== "hero") throw new Error("unreachable");
    expect(hero.props.imageAssetId).toBeTruthy();

    // Exactly what the schema permits: hero props with no `imageAssetId` at all.
    const { imageAssetId: _omitted, ...withoutPortrait } = hero.props;
    const outcome = propose({ hero: { props: withoutPortrait, visible: true } });

    expect(outcome.status).toBe("proposed");
    if (outcome.status !== "proposed") return;
    const proposedHero = outcome.document.sections.find((entry) => entry.type === "hero");
    expect(proposedHero?.type === "hero" && proposedHero.props.imageAssetId).toBe(
      hero.props.imageAssetId,
    );
  });

  it("keeps the album's photographs when the proposal only rewrites its heading", () => {
    const gallery = section("gallery");
    if (gallery.type !== "gallery") throw new Error("unreachable");

    const outcome = propose({
      gallery: { props: { heading: "Her first months" }, visible: gallery.visible },
    });

    expect(outcome.status).toBe("proposed");
    if (outcome.status !== "proposed") return;
    const proposed = outcome.document.sections.find((entry) => entry.type === "gallery");
    expect(proposed?.type === "gallery" && proposed.props.images).toEqual(gallery.props.images);
  });

  it("reads a null section as one the creator keeps", () => {
    const hero = section("hero");
    const outcome = propose({
      gallery: null,
      hero: { props: { ...hero.props, title: "Amihan Reyes" }, visible: true },
      message: null,
    });

    expect(outcome.status).toBe("proposed");
    if (outcome.status !== "proposed") return;
    // Named as null and therefore untouched — not cleared, and not reported as a change.
    expect(describeProposalChanges(document, outcome.document).map((entry) => entry.type)).toEqual([
      "hero",
    ]);
  });

  it("reads a null field as one the model had nothing to put in", () => {
    const hero = section("hero");
    if (hero.type !== "hero") throw new Error("unreachable");

    const outcome = propose({
      hero: { props: { ...hero.props, eyebrow: null, subtitle: null }, visible: true },
    });

    // `eyebrow: null` would fail the contract's `z.string().optional()`; an absent key
    // satisfies it. This is the whole reason the nulls are stripped before validation.
    expect(outcome.status).toBe("proposed");
    if (outcome.status !== "proposed") return;
    const proposed = outcome.document.sections.find((entry) => entry.type === "hero");
    expect(proposed?.type === "hero" && "eyebrow" in proposed.props).toBe(false);
  });

  it("keeps the sections that are buildable and drops only the one that is not", () => {
    const hero = section("hero");
    const outcome = propose({
      hero: { props: { ...hero.props, title: "Sofia Marquez" }, visible: true },
      // What the drafting model actually produced on 2026-08-06 for a creator who had not
      // settled a venue: told never to invent a fact, it wrote an empty string for a
      // required address. The contract strips blanks, so the field goes missing and this
      // section cannot be built.
      "event-details": {
        props: {
          events: [
            {
              address: "",
              dateLabel: "Saturday",
              label: "Debut",
              startAt: "2027-08-14T18:00:00+08:00",
              venueName: "",
            },
          ],
        },
        visible: true,
      },
    });

    expect(outcome.status).toBe("proposed");
    if (outcome.status !== "proposed") return;

    // The hero survives; the unbuildable section is simply absent from the diff rather than
    // taking the whole draft down with it.
    const changed = describeProposalChanges(document, outcome.document).map((entry) => entry.type);
    expect(changed).toContain("hero");
    expect(changed).not.toContain("event-details");
  });

  it("rejects when no section survives, rather than proposing an empty change", () => {
    expect(propose({ hero: { props: { eyebrow: "With joy" }, visible: true } })).toEqual({
      reason: "invalid_document",
      status: "rejected",
    });
  });

  it("rejects a section this draft does not contain", () => {
    const outcome = propose({
      venue: { props: { address: "Anywhere", venueName: "Somewhere" }, visible: true },
    });
    expect(outcome).toEqual({ reason: "section_not_in_draft", status: "rejected" });
  });

  it("rejects a proposal that is shaped right but is not a valid invitation", () => {
    expect(propose({ hero: { props: { eyebrow: "With joy" }, visible: true } })).toEqual({
      reason: "invalid_document",
      status: "rejected",
    });
  });

  it("rejects output that is not a proposal at all", () => {
    expect(resolveDocumentProposal("a lovely wedding", document, littleBlessings)).toEqual({
      reason: "unreadable",
      status: "rejected",
    });
    expect(propose({ hero: "make it nice" })).toEqual({ reason: "unreadable", status: "rejected" });
  });
});

describe("describing a proposal against the draft on screen", () => {
  it("names the changed fields and stays silent about untouched sections", () => {
    const hero = section("hero");
    const outcome = propose({
      hero: { props: { ...hero.props, title: "Amihan Reyes" }, visible: true },
    });
    if (outcome.status !== "proposed") throw new Error("expected a proposal");

    const changes = describeProposalChanges(document, outcome.document);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.type).toBe("hero");
    expect(changes[0]?.fields).toEqual(["title"]);
    expect(changes[0]?.visibility).toBeNull();
  });

  it("reports a section the proposal shows or hides", () => {
    const guidance = section("guidance");
    if (guidance.type !== "guidance") throw new Error("unreachable");

    const outcome = propose({
      guidance: { props: guidance.props, visible: !guidance.visible },
    });
    if (outcome.status !== "proposed") throw new Error("expected a proposal");

    const changes = describeProposalChanges(document, outcome.document);
    const change = changes.find((entry) => entry.type === "guidance");
    expect(change?.visibility).toBe(guidance.visible ? "hidden" : "shown");
    expect(change?.fields).toEqual([]);
  });

  it("reports nothing when the proposal says what the draft already says", () => {
    expect(describeProposalChanges(document, document)).toEqual([]);
  });
});
