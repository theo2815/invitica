import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import { describeProposalChanges } from "../src/lib/invitations/proposal-diff";
import { resolveDocumentProposal } from "../src/server/assistant/document-proposal";
import { buildProposalSchema, proposableSections } from "../src/server/assistant/document-schema";

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

  it("keeps every section optional, so an untouched one is left alone", () => {
    expect((schema as { required?: string[] }).required ?? []).toEqual([]);
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
