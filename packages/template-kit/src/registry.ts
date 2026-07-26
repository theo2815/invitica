import {
  type InvitationDocument,
  type InvitationSection,
  parseInvitationDocument,
} from "@invitica/invitation-schema";

import { type TemplateManifest, templateManifestSchema } from "./manifest.js";
import { sundayJoyTemplate } from "./templates/birthday/sunday-joy/v1.js";
import { littleBlessingsTemplate } from "./templates/christening/little-blessings/v1.js";
import { littleBlessingsTemplateV2 } from "./templates/christening/little-blessings/v2.js";
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

export class InvalidTemplateVersionChainError extends Error {
  constructor(identifier: string) {
    super(`Invalid template version chain: ${identifier}`);
    this.name = "InvalidTemplateVersionChainError";
  }
}

export class InvalidTemplateUpgradeError extends Error {
  constructor() {
    super("The requested template upgrade is not available.");
    this.name = "InvalidTemplateUpgradeError";
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
  const templateVersions = new Set<string>();
  const templateVersionIds = new Set<string>();

  const manifests = inputs.map((input) => {
    const manifest = templateManifestSchema.parse(input);
    const stableVersion = `${manifest.listing.id}@${manifest.version}`;

    if (templateVersions.has(stableVersion)) {
      throw new DuplicateTemplateRegistrationError(stableVersion);
    }

    if (templateVersionIds.has(manifest.templateVersionId)) {
      throw new DuplicateTemplateRegistrationError(manifest.templateVersionId);
    }

    templateVersions.add(stableVersion);
    templateVersionIds.add(manifest.templateVersionId);

    return manifest;
  });

  for (const manifest of manifests) {
    if (manifest.version === 1) {
      if (manifest.supersedesTemplateVersionId) {
        throw new InvalidTemplateVersionChainError(manifest.templateVersionId);
      }
      continue;
    }

    const predecessor = manifests.find(
      (candidate) => candidate.templateVersionId === manifest.supersedesTemplateVersionId,
    );

    if (
      !predecessor ||
      predecessor.listing.id !== manifest.listing.id ||
      predecessor.version !== manifest.version - 1
    ) {
      throw new InvalidTemplateVersionChainError(manifest.templateVersionId);
    }
  }

  return Object.freeze(manifests.map((manifest) => deepFreeze(manifest)));
}

export const templateRegistry = createTemplateRegistry([
  gardenPromiseTemplate,
  goldenHourTemplate,
  sundayJoyTemplate,
  littleBlessingsTemplate,
  littleBlessingsTemplateV2,
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
  [...new Set(templateRegistry.map((manifest) => manifest.listing.id))].map((templateId) => {
    const manifest = resolveTemplateById(templateId);
    return {
      ...manifest.listing,
      sections: [
        "Opening",
        ...new Set(
          manifest.defaultDocument.sections
            .filter((section) => section.visible)
            .map((section) => sectionLabels[section.type]),
        ),
      ],
    };
  }),
);

export function resolveTemplateById(templateId: string): TemplateManifest {
  const manifest = templateRegistry
    .filter((candidate) => candidate.listing.id === templateId)
    .sort((left, right) => right.version - left.version)[0];

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

export function resolveTemplateUpgrade(templateVersionId: string): TemplateManifest | null {
  resolveTemplateVersion(templateVersionId);
  return (
    templateRegistry.find(
      (candidate) => candidate.supersedesTemplateVersionId === templateVersionId,
    ) ?? null
  );
}

export function migrateTemplateDocument(
  document: InvitationDocument,
  targetTemplateVersionId: string,
): InvitationDocument {
  const target = resolveTemplateVersion(targetTemplateVersionId);

  if (target.supersedesTemplateVersionId !== document.templateVersionId) {
    throw new InvalidTemplateUpgradeError();
  }

  return parseInvitationDocument({
    ...structuredClone(document),
    templateVersionId: target.templateVersionId,
  });
}
