import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import {
  applyLittleBlessingsDetails,
  LITTLE_BLESSINGS_TEMPLATE_VERSION_ID,
  LittleBlessingsSectionError,
  littleBlessingsDetailsSchema,
} from "../src/lib/invitations/little-blessings-details";

const littleBlessings = resolveTemplateById("little-blessings");
const document = parseInvitationDocument(structuredClone(littleBlessings.defaultDocument));

function sectionOf(source: typeof document, type: string) {
  const section = source.sections.find((candidate) => candidate.type === type);
  if (!section) throw new Error(`Missing ${type} section`);
  return section;
}

function heroDetails(overrides: Record<string, unknown> = {}) {
  return { hero: { props: { title: "Eliana Grace", ...overrides }, visible: true } };
}

describe("Little Blessings details contract", () => {
  it("pins the template version the editor and migration 0016 both check", () => {
    expect(LITTLE_BLESSINGS_TEMPLATE_VERSION_ID).toBe(littleBlessings.templateVersionId);
  });

  it("treats a cleared optional field as absent rather than blank", () => {
    const parsed = littleBlessingsDetailsSchema.parse(
      heroDetails({ dateLabel: "   ", eyebrow: "", subtitle: "  A welcome  " }),
    );

    expect(parsed.hero?.props).toEqual({ subtitle: "A welcome", title: "Eliana Grace" });
  });

  it("refuses to hide the sections an invitation cannot do without", () => {
    expect(
      littleBlessingsDetailsSchema.safeParse({
        hero: { props: { title: "Eliana Grace" }, visible: false },
      }).success,
    ).toBe(false);

    const eventDetails = sectionOf(document, "event-details");
    expect(
      littleBlessingsDetailsSchema.safeParse({
        "event-details": { props: eventDetails.props, visible: false },
      }).success,
    ).toBe(false);
  });

  it("lets the creator hide an optional section", () => {
    const countdown = sectionOf(document, "countdown");
    const parsed = littleBlessingsDetailsSchema.parse({
      countdown: { props: countdown.props, visible: false },
    });

    expect(parsed.countdown?.visible).toBe(false);
  });

  it("empties a hidden album but never shows an empty one", () => {
    const starter = littleBlessings.starterDocument;

    if (!starter) {
      throw new Error("Little Blessings must ship a starter document.");
    }

    const starterDocument = parseInvitationDocument(structuredClone(starter));
    const emptyAlbum = { heading: "Our own little moments", images: [] };

    // What a new invitation saves on its very first autosave.
    const saved = applyLittleBlessingsDetails(starterDocument, {
      gallery: { props: emptyAlbum, visible: false },
    });

    expect(sectionOf(saved, "gallery").props).toEqual(emptyAlbum);
    expect(saved.assets).toEqual([]);

    expect(() =>
      applyLittleBlessingsDetails(starterDocument, {
        gallery: { props: emptyAlbum, visible: true },
      }),
    ).toThrow();

    // Emptying a filled album releases the photographs it declared.
    const emptied = applyLittleBlessingsDetails(document, {
      gallery: { props: emptyAlbum, visible: false },
    });
    const filledAlbum = document.sections.find((section) => section.type === "gallery");
    expect(filledAlbum?.props.images).toHaveLength(8);
    expect(emptied.assets).toHaveLength(document.assets.length - 8);
  });

  it("accepts eight photographs and eight gift ideas but not nine", () => {
    const gallery = sectionOf(document, "gallery");
    const gifts = sectionOf(document, "gifts");
    if (gallery.type !== "gallery" || gifts.type !== "gifts") throw new Error("Unexpected section");

    expect(gallery.props.images).toHaveLength(8);
    expect(gifts.props.items).toHaveLength(8);

    expect(
      littleBlessingsDetailsSchema.safeParse({
        gallery: { props: gallery.props, visible: true },
        gifts: { props: gifts.props, visible: true },
      }).success,
    ).toBe(true);

    expect(
      littleBlessingsDetailsSchema.safeParse({
        gifts: {
          props: { items: [...gifts.props.items, { name: "One too many" }] },
          visible: true,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a field the strict document contract does not define", () => {
    expect(
      littleBlessingsDetailsSchema.safeParse(heroDetails({ script: "<script>" })).success,
    ).toBe(false);
  });

  it("rejects a section type outside the Little Blessings surface", () => {
    expect(
      littleBlessingsDetailsSchema.safeParse({
        venue: { props: { address: "Somewhere", venueName: "Somewhere" }, visible: true },
      }).success,
    ).toBe(false);
  });
});

describe("applying Little Blessings details", () => {
  it("replaces the listed sections and leaves the rest untouched", () => {
    const details = littleBlessingsDetailsSchema.parse(
      heroDetails({ subtitle: "A day of thanksgiving" }),
    );
    const updated = applyLittleBlessingsDetails(document, details);
    const hero = sectionOf(updated, "hero");

    if (hero.type !== "hero") throw new Error("Unexpected section");
    expect(hero.props.title).toBe("Eliana Grace");
    expect(hero.props.imageAssetId).toBeUndefined();
    expect(sectionOf(updated, "guidance").props).toEqual(sectionOf(document, "guidance").props);
    expect(updated.sections.map((section) => section.type)).toEqual(
      document.sections.map((section) => section.type),
    );
  });

  it("keeps a hidden section's content in the document", () => {
    const countdown = sectionOf(document, "countdown");
    const updated = applyLittleBlessingsDetails(
      document,
      littleBlessingsDetailsSchema.parse({
        countdown: { props: countdown.props, visible: false },
      }),
    );
    const hidden = sectionOf(updated, "countdown");

    expect(hidden.visible).toBe(false);
    expect(hidden.props).toEqual(countdown.props);
  });

  it("rebuilds the asset list from the images the document still references", () => {
    const gallery = sectionOf(document, "gallery");
    const gifts = sectionOf(document, "gifts");
    if (gallery.type !== "gallery" || gifts.type !== "gifts") throw new Error("Unexpected section");

    const firstPhoto = gallery.props.images[0];
    const heroPortrait = "45000000-0000-4000-8000-000000000001";
    if (!firstPhoto) throw new Error("Expected a photograph");

    const updated = applyLittleBlessingsDetails(
      document,
      littleBlessingsDetailsSchema.parse({
        gallery: { props: { images: [firstPhoto] }, visible: true },
        gifts: {
          props: { items: gifts.props.items.map(({ name }) => ({ name })) },
          visible: true,
        },
        hero: { props: { imageAssetId: heroPortrait, title: "Eliana Grace" }, visible: true },
      }),
    );

    expect(updated.assets).toEqual([
      { id: heroPortrait, kind: "image" },
      { id: firstPhoto.assetId, kind: "image" },
    ]);
  });

  it("declares a newly referenced photograph without the caller maintaining a list", () => {
    const uploaded = "45000000-0000-4000-8000-0000000000aa";
    const updated = applyLittleBlessingsDetails(
      document,
      littleBlessingsDetailsSchema.parse({
        gallery: { props: { images: [{ assetId: uploaded }] }, visible: true },
      }),
    );

    expect(updated.assets.some((asset) => asset.id === uploaded)).toBe(true);
    expect(() => parseInvitationDocument(updated)).not.toThrow();
  });

  it("refuses a section this invitation does not contain", () => {
    const withoutGifts = parseInvitationDocument({
      ...document,
      assets: document.assets.filter(
        (asset) => asset.id !== "45000000-0000-4000-8000-000000000010",
      ),
      sections: document.sections.filter((section) => section.type !== "gifts"),
    });
    const gifts = sectionOf(document, "gifts");

    expect(() =>
      applyLittleBlessingsDetails(
        withoutGifts,
        littleBlessingsDetailsSchema.parse({ gifts: { props: gifts.props, visible: true } }),
      ),
    ).toThrow(LittleBlessingsSectionError);
  });

  it("keeps every caption state and both dress codes intact through a round trip", () => {
    const gallery = sectionOf(document, "gallery");
    const attire = sectionOf(document, "attire");
    if (gallery.type !== "gallery" || attire.type !== "attire") throw new Error("Unexpected");

    const updated = applyLittleBlessingsDetails(
      document,
      littleBlessingsDetailsSchema.parse({
        attire: { props: attire.props, visible: true },
        gallery: { props: gallery.props, visible: true },
      }),
    );

    const roundTripped = sectionOf(updated, "gallery");
    if (roundTripped.type !== "gallery") throw new Error("Unexpected section");

    expect(roundTripped.props.images).toEqual(gallery.props.images);
    expect(sectionOf(updated, "attire").props).toEqual(attire.props);
  });
});
