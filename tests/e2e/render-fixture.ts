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

function littleBlessingsAssetId(suffix: string): string {
  return `45000000-0000-4000-8000-00000000000${suffix}`;
}

function littleBlessingsFixture(): PublicationArtifact {
  const template = resolveTemplateById("little-blessings");
  const heroAssetId = littleBlessingsAssetId("1");
  const galleryAssetIds = ["2", "3", "4", "5", "9", "a", "b", "c"].map(littleBlessingsAssetId);
  const giftAssetIds = ["6", "7", "8", "d", "e", "f"].map(littleBlessingsAssetId);
  const extraGalleryImages = [
    { alt: "Eliana asleep in her grandmother's arms", caption: "A quiet Sunday nap" },
    { alt: "Eliana laughing at bath time", caption: "Splashes and giggles" },
    { alt: "Eliana with her tiny knitted bonnet", caption: "Made by Lola with love" },
    { alt: "Eliana reaching for the morning light", caption: "Bright mornings together" },
  ];
  const extraGiftItems = [
    { name: "Soft muslin blankets", note: "Breathable layers for warm afternoons" },
    { name: "Wooden stacking toys", note: "Sturdy pieces for growing hands" },
    { name: "Keepsake letters", note: "A note she can read when she is older" },
  ];

  const document: InvitationDocument = {
    ...template.defaultDocument,
    opening: {
      ...template.defaultDocument.opening,
      fallbackRecipientText: "The Villanueva, de la Cruz, Santos-Reyes, and Evangelista Family",
    },
    sections: template.defaultDocument.sections.map((section) => {
      if (section.type === "gallery") {
        return {
          ...section,
          props: {
            ...section.props,
            images: [
              ...section.props.images,
              ...extraGalleryImages.map((image, index) => ({
                ...image,
                assetId: galleryAssetIds[4 + index] as string,
              })),
            ],
          },
        };
      }

      if (section.type === "gifts") {
        return {
          ...section,
          props: {
            ...section.props,
            items: [
              ...section.props.items,
              ...extraGiftItems.map((item, index) => ({
                ...item,
                imageAssetId: giftAssetIds[3 + index] as string,
              })),
            ],
          },
        };
      }

      return section;
    }),
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
        ...giftAssetIds.map((assetId, index) => imageManifestEntry(assetId, 10 + index, 900, 900)),
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

export function renderFixture() {
  return {
    littleBlessingsHtml: renderPublicationHtml(littleBlessingsFixture()),
    publicationHtml: renderPublicationHtml(fixture()),
    unavailableHtml: renderUnavailableHtml(),
  };
}
