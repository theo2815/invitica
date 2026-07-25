import type { InvitationDocument, PublicationArtifact } from "@invitica/invitation-schema";
import { publicationMediaObjectKey } from "@invitica/invitation-schema";
import { resolveTemplateById } from "@invitica/template-kit";

import { renderPublicationHtml, renderUnavailableHtml } from "../../apps/viewer/src/html";

const publicationId = "a0000000-0000-4000-8000-000000000015";
const littleBlessingsPublicationId = "a0000000-0000-4000-8000-000000000016";

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

function mediaSha(index: number): string {
  return index.toString(16).padStart(2, "0").repeat(32);
}

function imageManifestEntry(
  assetId: string,
  shaIndex: number,
  width: number,
  height: number,
): PublicationArtifact["snapshot"]["assets"][number] {
  const sha256 = mediaSha(shaIndex);
  return {
    contentType: "image/webp",
    height,
    id: assetId,
    kind: "image",
    renditions: [320, 640].map((renditionWidth) => ({
      byteLength: 18_000,
      height: Math.round((height / width) * renditionWidth),
      objectKey: publicationMediaObjectKey(sha256, renditionWidth),
      sha256,
      width: renditionWidth,
    })),
    width,
  };
}

function littleBlessingsAssetId(tail: string): string {
  return `45000000-0000-4000-8000-${tail.padStart(12, "0")}`;
}

function littleBlessingsFixture(): PublicationArtifact {
  const template = resolveTemplateById("little-blessings");
  const heroAssetId = littleBlessingsAssetId("1");
  // The template deliberately ships two gift ideas without a picture; this lane gives every idea
  // one so the page carries its heaviest realistic media load.
  const extraGiftAssetIds = [littleBlessingsAssetId("16"), littleBlessingsAssetId("17")];
  const galleryAssetIds: string[] = [];
  const giftAssetIds: string[] = [];

  const sections = template.defaultDocument.sections.map((section) => {
    if (section.type === "gallery") {
      // An odd album proves the unpaired plate centres, while the even gift page beside it keeps
      // proving the plain two-up rows. One page of each covers both halves of the shared rule.
      // The dropped photograph is a plain titled-and-captioned one, so the lane keeps every
      // caption state — including the last plate, which carries no writing at all.
      const images = [...section.props.images.slice(0, 3), ...section.props.images.slice(4)];
      galleryAssetIds.push(...images.map((image) => image.assetId));
      return { ...section, props: { ...section.props, images } };
    }

    if (section.type === "gifts") {
      let nextExtra = 0;
      const items = section.props.items.map((item) => ({
        ...item,
        imageAssetId: item.imageAssetId ?? (extraGiftAssetIds[nextExtra++] as string),
      }));
      giftAssetIds.push(...items.map((item) => item.imageAssetId));
      return { ...section, props: { ...section.props, items } };
    }

    return section;
  });

  const document: InvitationDocument = {
    ...template.defaultDocument,
    opening: {
      ...template.defaultDocument.opening,
      fallbackRecipientText: "The Villanueva, de la Cruz, Santos-Reyes, and Evangelista Family",
    },
    sections,
    assets: [heroAssetId, ...galleryAssetIds, ...giftAssetIds].map((id) => ({
      id,
      kind: "image" as const,
    })),
  };

  return {
    artifactVersion: 1,
    publicationId: littleBlessingsPublicationId,
    snapshot: {
      assets: [
        imageManifestEntry(heroAssetId, 1, 1200, 1500),
        ...galleryAssetIds.map((assetId, index) =>
          imageManifestEntry(assetId, 2 + index, 1200, 900),
        ),
        ...giftAssetIds.map((assetId, index) => imageManifestEntry(assetId, 20 + index, 900, 900)),
      ],
      document,
      draftRevision: 3,
      invitationSchemaVersion: template.schemaVersion,
      rendererKey: template.rendererKey,
      rendererVersion: 1,
      snapshotVersion: 1,
      templateVersion: template.version,
      templateVersionId: template.templateVersionId,
    },
  };
}

/**
 * Stands in for the deployment's MapTiler key so the browser lanes exercise the click-to-load venue
 * map. The specs stub the tile host, so no request leaves the machine.
 */
const FIXTURE_MAP_TILE_KEY = "e2e-fixture-map-key";

export function renderFixture() {
  return {
    littleBlessingsHtml: renderPublicationHtml(littleBlessingsFixture(), FIXTURE_MAP_TILE_KEY),
    publicationHtml: renderPublicationHtml(fixture()),
    unavailableHtml: renderUnavailableHtml(),
  };
}
