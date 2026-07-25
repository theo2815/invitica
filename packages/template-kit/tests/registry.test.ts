import { describe, expect, it } from "vitest";

import {
  createTemplateRegistry,
  DuplicateTemplateRegistrationError,
  resolveTemplateById,
  resolveTemplateVersion,
  templateCatalog,
  templateManifestSchema,
  templateRegistry,
  UnknownTemplateError,
} from "../src/index.js";

describe("template registry", () => {
  it("registers four immutable schema-valid template fixtures", () => {
    expect(templateRegistry).toHaveLength(4);
    expect(Object.isFrozen(templateRegistry)).toBe(true);

    for (const manifest of templateRegistry) {
      expect(templateManifestSchema.parse(manifest)).toEqual(manifest);
      expect(Object.isFrozen(manifest.defaultDocument)).toBe(true);
      expect(manifest.defaultDocument.templateVersionId).toBe(manifest.templateVersionId);
    }

    expect(resolveTemplateById("garden-promise")).toMatchObject({
      qualityStatus: "production",
      rendererKey: "garden-promise-v1",
    });
    expect(
      templateRegistry
        .filter((manifest) => manifest.listing.id !== "garden-promise")
        .map((manifest) => [manifest.rendererKey, manifest.qualityStatus]),
    ).toEqual([
      ["standard-v1", "fixture"],
      ["standard-v1", "fixture"],
      ["little-blessings-v1", "fixture"],
    ]);

    expect(resolveTemplateById("little-blessings")).toMatchObject({
      listing: { occasion: "Christening", name: "Little Blessings" },
      qualityStatus: "fixture",
      rendererKey: "little-blessings-v1",
      schemaVersion: 1,
    });
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
      "Venue",
      "Message",
      "RSVP",
    ]);
    expect(
      templateCatalog.find((template) => template.id === "little-blessings")?.sections,
    ).toEqual([
      "Opening",
      "Event details",
      "Message",
      "Countdown",
      "Parents and godparents",
      "Order of the day",
      "What to wear",
      "Gallery",
      "A gentle note",
      "Gift ideas",
      "RSVP",
    ]);
  });

  it("keeps Little Blessings preview-only with bounded declared image references", () => {
    const littleBlessings = resolveTemplateById("little-blessings");
    const gallery = littleBlessings.defaultDocument.sections.find(
      (section) => section.type === "gallery",
    );
    const gifts = littleBlessings.defaultDocument.sections.find(
      (section) => section.type === "gifts",
    );

    expect(littleBlessings.qualityStatus).toBe("fixture");
    expect(littleBlessings.defaultDocument.assets).toHaveLength(15);
    expect(gallery?.props.images).toHaveLength(8);
    expect(gifts?.props.items).toHaveLength(8);
    // Gift pictures are optional, so the fixture deliberately carries image-less ideas too.
    expect(gifts?.props.items.filter((item) => Boolean(item.imageAssetId))).toHaveLength(6);
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
});
