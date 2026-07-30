import { describe, expect, it } from "vitest";

import {
  createTemplateRegistry,
  DuplicateTemplateRegistrationError,
  InvalidTemplateUpgradeError,
  InvalidTemplateVersionChainError,
  migrateTemplateDocument,
  resolveTemplateById,
  resolveTemplateUpgrade,
  resolveTemplateVersion,
  templateCatalog,
  templateManifestSchema,
  templateRegistry,
  templateStarterDocument,
  UnknownTemplateError,
} from "../src/index.js";

describe("template registry", () => {
  it("registers eight immutable schema-valid template versions", () => {
    expect(templateRegistry).toHaveLength(8);
    expect(Object.isFrozen(templateRegistry)).toBe(true);

    for (const manifest of templateRegistry) {
      expect(templateManifestSchema.parse(manifest)).toEqual(manifest);
      expect(Object.isFrozen(manifest.defaultDocument)).toBe(true);
      expect(manifest.defaultDocument.templateVersionId).toBe(manifest.templateVersionId);
    }

    expect(resolveTemplateById("garden-promise")).toMatchObject({
      qualityStatus: "production",
      rendererKey: "garden-promise-v2",
      version: 2,
    });
    expect(
      templateRegistry.map((manifest) => [manifest.rendererKey, manifest.qualityStatus]),
    ).toEqual([
      ["garden-promise-v1", "production"],
      ["garden-promise-v2", "production"],
      ["standard-v1", "fixture"],
      ["golden-hour-v2", "production"],
      ["standard-v1", "fixture"],
      ["sunday-joy-v2", "production"],
      ["little-blessings-v1", "production"],
      ["little-blessings-v2", "production"],
    ]);

    expect(resolveTemplateById("little-blessings")).toMatchObject({
      listing: { occasion: "Christening", name: "Little Blessings" },
      qualityStatus: "production",
      rendererKey: "little-blessings-v2",
      schemaVersion: 1,
      supersedesTemplateVersionId: "40000000-0000-4000-8000-000000000004",
      version: 2,
    });
  });

  // The shared invitation message calls the celebrant "her", "his", or "their" from this field.
  // A template that omitted it would misgender a child, so the schema makes it required and this
  // pins the declared value of every registered template.
  it("declares how the shared message refers to each template's celebrant", () => {
    expect(
      templateRegistry.map((manifest) => [manifest.listing.id, manifest.celebrantPronoun]),
    ).toEqual([
      // A wedding celebrates two people, so the neutral form is correct rather than a fallback.
      ["garden-promise", "they"],
      ["garden-promise", "they"],
      ["golden-hour", "she"],
      ["golden-hour", "she"],
      ["sunday-joy", "she"],
      ["sunday-joy", "she"],
      ["little-blessings", "she"],
      ["little-blessings", "she"],
    ]);

    expect(() =>
      templateManifestSchema.parse({
        ...resolveTemplateById("garden-promise"),
        celebrantPronoun: "it",
      }),
    ).toThrow();
  });

  it("pins each template version to an explicit editor contract", () => {
    expect(
      templateRegistry.map((manifest) => [
        manifest.listing.id,
        manifest.version,
        manifest.editorKey,
      ]),
    ).toEqual([
      ["garden-promise", 1, "focused-event-v1"],
      ["garden-promise", 2, "section-document-v1"],
      ["golden-hour", 1, "focused-event-v1"],
      ["golden-hour", 2, "section-document-v1"],
      ["sunday-joy", 1, "focused-event-v1"],
      ["sunday-joy", 2, "section-document-v1"],
      ["little-blessings", 1, "section-document-v1"],
      ["little-blessings", 2, "section-document-v1"],
    ]);
  });

  it("resolves stable template and version identifiers and rejects unknown values", () => {
    const gardenPromise = resolveTemplateById("garden-promise");

    expect(gardenPromise.listing.name).toBe("Garden Promise");
    expect(resolveTemplateVersion(gardenPromise.templateVersionId)).toBe(gardenPromise);
    expect(() => resolveTemplateById("unknown-template")).toThrow(UnknownTemplateError);
    expect(() => resolveTemplateVersion("00000000-0000-4000-8000-000000000000")).toThrow(
      UnknownTemplateError,
    );
  });

  it("rejects a default document pinned to a different template version", () => {
    const gardenPromise = resolveTemplateById("garden-promise");
    const result = templateManifestSchema.safeParse({
      ...gardenPromise,
      defaultDocument: {
        ...gardenPromise.defaultDocument,
        templateVersionId: "00000000-0000-4000-8000-000000000000",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate stable or version identifiers", () => {
    const gardenPromise = resolveTemplateById("garden-promise");

    expect(() => createTemplateRegistry([gardenPromise, gardenPromise])).toThrow(
      DuplicateTemplateRegistrationError,
    );
  });

  it("derives catalog sections from the schema-backed default documents", () => {
    expect(templateCatalog).toHaveLength(4);
    expect(templateCatalog.find((template) => template.id === "golden-hour")?.sections).toEqual([
      "Opening",
      "Event details",
      "Message",
      "Countdown",
      "People in the program",
      "Schedule",
      "Attire",
      "Guest notes",
      "RSVP",
    ]);
    expect(
      templateCatalog.find((template) => template.id === "little-blessings")?.sections,
    ).toEqual([
      "Opening",
      "Event details",
      "Message",
      "Countdown",
      "People in the program",
      "Schedule",
      "Attire",
      "Gallery",
      "Guest notes",
      "Gifts",
      "RSVP",
    ]);
  });

  it("shows Little Blessings with bounded declared image references in the catalog", () => {
    const littleBlessings = resolveTemplateById("little-blessings");
    const gallery = littleBlessings.defaultDocument.sections.find(
      (section) => section.type === "gallery",
    );
    const gifts = littleBlessings.defaultDocument.sections.find(
      (section) => section.type === "gifts",
    );

    expect(littleBlessings.qualityStatus).toBe("production");
    expect(littleBlessings.defaultDocument.assets).toHaveLength(15);
    expect(gallery?.props.images).toHaveLength(8);
    expect(gifts?.props.items).toHaveLength(8);
    // Gift pictures are optional, so the showcase deliberately carries image-less ideas too.
    expect(gifts?.props.items.filter((item) => Boolean(item.imageAssetId))).toHaveLength(6);
  });

  it("starts a Little Blessings draft with the creator's own empty photograph slots", () => {
    const littleBlessings = resolveTemplateById("little-blessings");
    const starter = templateStarterDocument(littleBlessings);

    // The showcase's photographs belong to the catalog. A draft that referenced
    // them could not be published until all fifteen had been replaced.
    expect(starter).toBe(littleBlessings.starterDocument);
    expect(starter.assets).toEqual([]);
    expect(starter.sections.map((section) => section.type)).toEqual(
      littleBlessings.defaultDocument.sections.map((section) => section.type),
    );

    const hero = starter.sections.find((section) => section.type === "hero");
    const gallery = starter.sections.find((section) => section.type === "gallery");
    const gifts = starter.sections.find((section) => section.type === "gifts");

    expect(hero?.props.imageAssetId).toBeUndefined();
    // Present so the creator can fill it, hidden and empty because they have not yet.
    expect(gallery?.visible).toBe(false);
    expect(gallery?.props.images).toEqual([]);
    expect(gifts?.props.items.every((item) => item.imageAssetId === undefined)).toBe(true);
  });

  it("falls back to the showcase only for templates that ship no media", () => {
    const goldenHour = resolveTemplateById("golden-hour");

    expect(goldenHour.starterDocument).toBeUndefined();
    expect(templateStarterDocument(goldenHour)).toBe(goldenHour.defaultDocument);

    // A media-carrying showcase without a starter would be created as a draft
    // referencing media the creator never uploaded.
    expect(
      templateManifestSchema.safeParse({
        ...resolveTemplateById("little-blessings"),
        starterDocument: undefined,
      }).success,
    ).toBe(false);
  });

  it("shows every Garden Promise section in the catalog and hides the unfilled ones in a draft", () => {
    const gardenPromise = resolveTemplateById("garden-promise");
    const showcase = gardenPromise.defaultDocument;
    const starter = templateStarterDocument(gardenPromise);

    // The catalog shows the whole template, so a creator judges it before choosing it.
    expect(showcase.sections.every((section) => section.visible)).toBe(true);
    expect(
      showcase.sections.find((section) => section.type === "gallery")?.props.images,
    ).toHaveLength(4);

    // Every image slot the template offers is represented, so the preview shows a placeholder for
    // each one rather than only for the album: the couple's portrait, four album frames, and a
    // picture for every gift idea.
    const showcaseHero = showcase.sections.find((section) => section.type === "hero");
    const showcaseGifts = showcase.sections.find((section) => section.type === "gifts");

    expect(showcaseHero?.props.imageAssetId).toBeDefined();
    expect(showcaseGifts?.props.items).toHaveLength(3);
    expect(showcaseGifts?.props.items.every((item) => Boolean(item.imageAssetId))).toBe(true);
    expect(showcase.assets).toHaveLength(8);

    const showcaseEvents = showcase.sections.find((section) => section.type === "event-details")
      ?.props.events;
    expect(
      showcaseEvents?.every(
        (event) => event.latitude !== undefined && event.longitude !== undefined,
      ),
    ).toBe(true);

    // A first draft can only contain what the couple could publish today.
    expect(starter).toBe(gardenPromise.starterDocument);
    expect(starter.assets).toEqual([]);
    expect(starter.sections.map((section) => section.type)).toEqual(
      showcase.sections.map((section) => section.type),
    );

    const hero = starter.sections.find((section) => section.type === "hero");
    const gallery = starter.sections.find((section) => section.type === "gallery");
    const gifts = starter.sections.find((section) => section.type === "gifts");
    const starterEvents = starter.sections.find((section) => section.type === "event-details")
      ?.props.events;

    // None of the showcase's picture slots follow a creator into their first draft.
    expect(hero?.props.imageAssetId).toBeUndefined();
    expect(gallery?.visible).toBe(false);
    expect(gallery?.props.images).toEqual([]);
    expect(gifts?.visible).toBe(false);
    expect(gifts?.props.items.every((item) => item.imageAssetId === undefined)).toBe(true);
    expect(
      starterEvents?.every(
        (event) => event.latitude === undefined && event.longitude === undefined,
      ),
    ).toBe(true);
  });

  it("rejects a starter document that references media", () => {
    const littleBlessings = resolveTemplateById("little-blessings");
    const result = templateManifestSchema.safeParse({
      ...littleBlessings,
      starterDocument: littleBlessings.defaultDocument,
    });

    expect(result.success).toBe(false);
  });

  it("keeps the reply section last so guests read the invitation before deciding", () => {
    const sections = resolveTemplateById("little-blessings").defaultDocument.sections;

    expect(sections.at(-1)?.type).toBe("rsvp");
  });

  it("offers Little Blessings photograph captions and dress codes as optional content", () => {
    const sections = resolveTemplateById("little-blessings").defaultDocument.sections;
    const gallery = sections.find((section) => section.type === "gallery");
    const attire = sections.find((section) => section.type === "attire");

    // Every caption state is represented, including a photograph tipped in with no writing.
    expect(gallery?.props.images.some((image) => image.title && image.caption)).toBe(true);
    expect(gallery?.props.images.some((image) => image.title && !image.caption)).toBe(true);
    expect(gallery?.props.images.some((image) => !image.title && image.caption)).toBe(true);
    expect(gallery?.props.images.some((image) => !image.title && !image.caption)).toBe(true);

    expect(attire?.props.groups?.map((group) => group.label)).toEqual([
      "Ninong and ninang",
      "Our guests",
    ]);
  });

  it("selects the latest stable version while retaining immutable version lookup", () => {
    const latest = resolveTemplateById("little-blessings");
    const previous = resolveTemplateVersion("40000000-0000-4000-8000-000000000004");

    expect(latest.version).toBe(2);
    expect(latest.templateVersionId).not.toBe(previous.templateVersionId);
    expect(resolveTemplateUpgrade(previous.templateVersionId)).toBe(latest);
    expect(resolveTemplateUpgrade(latest.templateVersionId)).toBeNull();
    expect(templateCatalog.filter((template) => template.id === "little-blessings")).toHaveLength(
      1,
    );
  });

  it("keeps structurally different successors new-drafts-only", () => {
    const structuralSuccessors = [
      ["40000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000006"],
      ["40000000-0000-4000-8000-000000000002", "40000000-0000-4000-8000-000000000007"],
      ["40000000-0000-4000-8000-000000000003", "40000000-0000-4000-8000-000000000008"],
    ] as const;

    for (const [sourceId, targetId] of structuralSuccessors) {
      const source = resolveTemplateVersion(sourceId);
      expect(resolveTemplateUpgrade(sourceId)).toBeNull();
      expect(() =>
        migrateTemplateDocument(structuredClone(templateStarterDocument(source)), targetId),
      ).toThrow(InvalidTemplateUpgradeError);
    }
  });

  it("migrates only the version pin and preserves every creator-owned field", () => {
    const latest = resolveTemplateById("little-blessings");
    const previous = resolveTemplateVersion("40000000-0000-4000-8000-000000000004");
    const customized = structuredClone(templateStarterDocument(previous));
    const hero = customized.sections.find((section) => section.type === "hero");
    const gallery = customized.sections.find((section) => section.type === "gallery");

    if (!hero || !gallery) throw new Error("Little Blessings sections are required");
    hero.props.title = "A creator's saved child name";
    gallery.props.heading = "Creator-owned album heading";

    const migrated = migrateTemplateDocument(customized, latest.templateVersionId);

    expect(migrated).not.toBe(customized);
    expect(migrated.templateVersionId).toBe(latest.templateVersionId);
    expect({ ...migrated, templateVersionId: previous.templateVersionId }).toEqual(customized);
    expect(() => migrateTemplateDocument(migrated, previous.templateVersionId)).toThrow(
      InvalidTemplateUpgradeError,
    );
  });

  it("rejects orphaned or cross-family version chains", () => {
    const latest = resolveTemplateById("little-blessings");
    expect(() => createTemplateRegistry([latest])).toThrow(InvalidTemplateVersionChainError);

    expect(() =>
      createTemplateRegistry([
        resolveTemplateById("garden-promise"),
        {
          ...latest,
          supersedesTemplateVersionId: resolveTemplateById("garden-promise").templateVersionId,
        },
      ]),
    ).toThrow(InvalidTemplateVersionChainError);
  });
});
