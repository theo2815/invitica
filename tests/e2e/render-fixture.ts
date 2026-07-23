import type { PublicationArtifact } from "@invitica/invitation-schema";
import { resolveTemplateById } from "@invitica/template-kit";

import { renderPublicationHtml, renderUnavailableHtml } from "../../apps/viewer/src/html";

const publicationId = "a0000000-0000-4000-8000-000000000015";

function fixture(): PublicationArtifact {
  const template = resolveTemplateById("garden-promise");
  return {
    artifactVersion: 1,
    publicationId,
    snapshot: {
      assets: [],
      document: {
        ...template.defaultDocument,
        opening: {
          ...template.defaultDocument.opening,
          fallbackRecipientText: "The Villanueva, de la Cruz, Santos-Reyes, and Evangelista Family",
        },
        sections: template.defaultDocument.sections.map((section) =>
          section.type === "hero"
            ? { ...section, props: { ...section.props, title: "Alexandria & Maximiliano" } }
            : section,
        ),
      },
      draftRevision: 7,
      invitationSchemaVersion: template.schemaVersion,
      rendererKey: template.rendererKey,
      rendererVersion: 1,
      snapshotVersion: 1,
      templateVersion: template.version,
      templateVersionId: template.templateVersionId,
    },
  };
}

export function renderFixture() {
  return {
    publicationHtml: renderPublicationHtml(fixture()),
    unavailableHtml: renderUnavailableHtml(),
  };
}
