import type { InvitationSection } from "@invitica/invitation-schema";

import { type TemplateManifest, templateManifestSchema } from "./manifest.js";
import { sundayJoyTemplate } from "./templates/birthday/sunday-joy/v1.js";
import { littleBlessingsTemplate } from "./templates/christening/little-blessings/v1.js";
import { goldenHourTemplate } from "./templates/debut/golden-hour/v1.js";
import { gardenPromiseTemplate } from "./templates/wedding/garden-promise/v1.js";

export class DuplicateTemplateRegistrationError extends Error {
  constructor(identifier: string) {
    super(`Duplicate template registration: ${identifier}`);
    this.name = "DuplicateTemplateRegistrationError";
  }
}

export class UnknownTemplateError extends Error {
  constructor(identifier: string) {
    super(`Unknown template: ${identifier}`);
    this.name = "UnknownTemplateError";
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

export function createTemplateRegistry(inputs: readonly unknown[]): readonly TemplateManifest[] {
  const templateIds = new Set<string>();
  const templateVersionIds = new Set<string>();

  return Object.freeze(
    inputs.map((input) => {
      const manifest = templateManifestSchema.parse(input);

      if (templateIds.has(manifest.listing.id)) {
        throw new DuplicateTemplateRegistrationError(manifest.listing.id);
      }

      if (templateVersionIds.has(manifest.templateVersionId)) {
        throw new DuplicateTemplateRegistrationError(manifest.templateVersionId);
      }

      templateIds.add(manifest.listing.id);
      templateVersionIds.add(manifest.templateVersionId);

      return deepFreeze(manifest);
    }),
  );
}

export const templateRegistry = createTemplateRegistry([
  gardenPromiseTemplate,
  goldenHourTemplate,
  sundayJoyTemplate,
  littleBlessingsTemplate,
]);

const sectionLabels: Record<InvitationSection["type"], string> = {
  hero: "Event details",
  message: "Message",
  venue: "Venue",
  rsvp: "RSVP",
  countdown: "Countdown",
  "event-details": "Event details",
  participants: "Parents and godparents",
  schedule: "Order of the day",
  attire: "What to wear",
  gallery: "Gallery",
  guidance: "A gentle note",
  gifts: "Gift ideas",
};

export interface TemplateCatalogEntry {
  readonly id: string;
  readonly occasion: TemplateManifest["listing"]["occasion"];
  readonly name: string;
  readonly previewTitle: string;
  readonly date: string;
  readonly tier: TemplateManifest["listing"]["tier"];
  readonly style: string;
  readonly description: string;
  readonly sections: readonly string[];
}

export const templateCatalog: readonly TemplateCatalogEntry[] = deepFreeze(
  templateRegistry.map((manifest) => ({
    ...manifest.listing,
    sections: [
      "Opening",
      ...new Set(
        manifest.defaultDocument.sections
          .filter((section) => section.visible)
          .map((section) => sectionLabels[section.type]),
      ),
    ],
  })),
);

export function resolveTemplateById(templateId: string): TemplateManifest {
  const manifest = templateRegistry.find((candidate) => candidate.listing.id === templateId);

  if (!manifest) {
    throw new UnknownTemplateError(templateId);
  }

  return manifest;
}

export function resolveTemplateVersion(templateVersionId: string): TemplateManifest {
  const manifest = templateRegistry.find(
    (candidate) => candidate.templateVersionId === templateVersionId,
  );

  if (!manifest) {
    throw new UnknownTemplateError(templateVersionId);
  }

  return manifest;
}
