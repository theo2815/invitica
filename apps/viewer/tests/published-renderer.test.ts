import { parsePublicationArtifact } from "@invitica/invitation-schema";
import { LittleBlessingsRendererV2 } from "@invitica/renderer";
import { resolveTemplateById, templateStarterDocument } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import {
  IncompatiblePublicationRendererError,
  resolvePublishedRenderer,
} from "../src/published-renderer";

const littleBlessingsV2 = resolveTemplateById("little-blessings");

function v2Artifact(rendererVersion = 2) {
  return parsePublicationArtifact({
    artifactVersion: 1,
    publicationId: "92000000-0000-4000-8000-000000000002",
    snapshot: {
      assets: [],
      document: templateStarterDocument(littleBlessingsV2),
      draftRevision: 5,
      invitationSchemaVersion: littleBlessingsV2.schemaVersion,
      rendererKey: littleBlessingsV2.rendererKey,
      rendererVersion,
      snapshotVersion: 1,
      templateVersion: littleBlessingsV2.version,
      templateVersionId: littleBlessingsV2.templateVersionId,
    },
  });
}

describe("published renderer resolution", () => {
  it("resolves the immutable Little Blessings v2 renderer pin", () => {
    expect(littleBlessingsV2).toMatchObject({
      rendererKey: "little-blessings-v2",
      version: 2,
    });
    expect(resolvePublishedRenderer(v2Artifact())).toBe(LittleBlessingsRendererV2);
  });

  it("rejects a snapshot that combines the v2 key with v1 renderer semantics", () => {
    expect(() => resolvePublishedRenderer(v2Artifact(1))).toThrow(
      IncompatiblePublicationRendererError,
    );
  });
});
