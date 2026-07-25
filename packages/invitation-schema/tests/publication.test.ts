import { describe, expect, it } from "vitest";

import {
  parsePublicationAlias,
  parsePublicationArtifact,
  parsePublicationSnapshot,
  publicationPublicIdentifierSchema,
  publicationSnapshotV1Schema,
  UnsupportedPublicationSnapshotVersionError,
} from "../src/index.js";
import { invitationFixture } from "../src/testing.js";

const validSnapshot = {
  snapshotVersion: 1,
  invitationSchemaVersion: 1,
  rendererKey: "standard-v1",
  rendererVersion: 1,
  templateVersionId: invitationFixture.templateVersionId,
  templateVersion: 1,
  draftRevision: 3,
  document: invitationFixture,
  assets: [],
} as const;

describe("publication snapshot schema", () => {
  it("parses an immutable version-one publication contract", () => {
    expect(parsePublicationSnapshot(validSnapshot)).toEqual(validSnapshot);
  });

  it("rejects unsupported snapshot versions before delivery", () => {
    expect(() =>
      parsePublicationSnapshot({
        ...validSnapshot,
        snapshotVersion: 2,
      }),
    ).toThrow(UnsupportedPublicationSnapshotVersionError);
  });

  it("rejects a template pin that differs from the stored document", () => {
    expect(
      publicationSnapshotV1Schema.safeParse({
        ...validSnapshot,
        templateVersionId: "30000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });

  it("requires one resolved manifest entry for every document asset", () => {
    const assetId = "30000000-0000-4000-8000-000000000002";

    expect(
      publicationSnapshotV1Schema.safeParse({
        ...validSnapshot,
        document: {
          ...invitationFixture,
          assets: [{ id: assetId, kind: "image" }],
        },
      }).success,
    ).toBe(false);
  });

  it("resolves an image asset with responsive renditions", () => {
    const assetId = "30000000-0000-4000-8000-000000000003";

    expect(
      publicationSnapshotV1Schema.safeParse({
        ...validSnapshot,
        document: {
          ...invitationFixture,
          assets: [{ id: assetId, kind: "image" }],
        },
        assets: [
          {
            id: assetId,
            kind: "image",
            contentType: "image/webp",
            width: 1600,
            height: 1200,
            renditions: [
              {
                width: 320,
                height: 240,
                objectKey: `publication-media/v1/${"a".repeat(64)}/w320.webp`,
                byteLength: 12000,
                sha256: "a".repeat(64),
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects unsafe object-storage keys in renditions", () => {
    const assetId = "30000000-0000-4000-8000-000000000005";

    expect(
      publicationSnapshotV1Schema.safeParse({
        ...validSnapshot,
        document: {
          ...invitationFixture,
          assets: [{ id: assetId, kind: "image" }],
        },
        assets: [
          {
            id: assetId,
            kind: "image",
            contentType: "image/webp",
            width: 1600,
            height: 1200,
            renditions: [
              {
                width: 320,
                height: 240,
                objectKey: "publication-media/../private/original.webp",
                byteLength: 12000,
                sha256: "a".repeat(64),
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("parses the minimal immutable artifact and alias contracts", () => {
    const publicationId = "30000000-0000-4000-8000-000000000004";
    const artifactKey = `publication-artifacts/v1/${publicationId}.json`;
    const artifact = parsePublicationArtifact({
      artifactVersion: 1,
      publicationId,
      snapshot: validSnapshot,
    });

    expect(
      parsePublicationAlias({
        aliasVersion: 1,
        publicationId,
        artifactKey,
        artifactSha256: "b".repeat(64),
      }),
    ).toEqual({
      aliasVersion: 1,
      publicationId,
      artifactKey,
      artifactSha256: "b".repeat(64),
    });
    expect(artifact.snapshot).toEqual(validSnapshot);
  });

  it("requires exactly 128 bits of lowercase random public identifier material", () => {
    expect(publicationPublicIdentifierSchema.safeParse("a".repeat(32)).success).toBe(true);
    expect(publicationPublicIdentifierSchema.safeParse("A".repeat(32)).success).toBe(false);
    expect(publicationPublicIdentifierSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("rejects aliases with unsafe or unverifiable artifact targets", () => {
    expect(() =>
      parsePublicationAlias({
        aliasVersion: 1,
        publicationId: "30000000-0000-4000-8000-000000000004",
        artifactKey: "publication-artifacts/../private.json",
        artifactSha256: "not-a-digest",
      }),
    ).toThrow();
  });
});
