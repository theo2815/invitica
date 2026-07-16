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
  it("registers three immutable schema-valid template fixtures", () => {
    expect(templateRegistry).toHaveLength(3);
    expect(Object.isFrozen(templateRegistry)).toBe(true);

    for (const manifest of templateRegistry) {
      expect(templateManifestSchema.parse(manifest)).toEqual(manifest);
      expect(Object.isFrozen(manifest.defaultDocument)).toBe(true);
      expect(manifest.defaultDocument.templateVersionId).toBe(manifest.templateVersionId);
      expect(manifest.rendererKey).toBe("standard-v1");
      expect(manifest.qualityStatus).toBe("fixture");
    }
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
    expect(templateCatalog).toHaveLength(3);
    expect(templateCatalog.find((template) => template.id === "golden-hour")?.sections).toEqual([
      "Opening",
      "Event details",
      "Venue",
      "Message",
      "RSVP",
    ]);
  });
});
