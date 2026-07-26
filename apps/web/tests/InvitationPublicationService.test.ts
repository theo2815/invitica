import { resolveTemplateById } from "@invitica/template-kit";
import { describe, expect, it, vi } from "vitest";

import {
  InvitationDraftConflictError,
  InvitationDraftPersistenceError,
} from "../src/server/invitations/drafts";
import {
  loadInvitationPublicationStatus,
  PublicationAssetsUnavailableError,
  PublicationPersistenceError,
  requestInvitationPublication,
} from "../src/server/invitations/publications";

const invitationId = "71000000-0000-4000-8000-000000000001";
const idempotencyKey = "91000000-0000-4000-8000-000000000001";
const publicationId = "92000000-0000-4000-8000-000000000001";
const gardenPromise = resolveTemplateById("garden-promise");

function createPublicationClient(
  draft: unknown,
  rpcResult: { data: unknown; error: unknown } = { data: publicationId, error: null },
  mediaRow: unknown = null,
) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const from = vi.fn((table: string) => {
    const media = table === "invitation_media_assets";
    const builder: Record<string, unknown> = {
      eq: vi.fn(() => builder),
      // Media resolution reads every referenced asset through one `in` query and awaits
      // the builder itself; the draft read still ends in `maybeSingle`.
      in: vi.fn(() => Promise.resolve({ data: mediaRow === null ? [] : [mediaRow], error: null })),
      maybeSingle: vi.fn().mockResolvedValue({ data: media ? mediaRow : draft, error: null }),
      select: vi.fn(() => builder),
    };
    return builder;
  });

  return { from, rpc };
}

const noopMediaStore = {
  copy: async () => {},
  delete: async () => {},
  head: async () => false,
  put: async () => {},
};

function storedDraft(document: unknown = gardenPromise.defaultDocument, revision = 4) {
  return {
    document,
    invitation_id: invitationId,
    revision,
    template_version_id: gardenPromise.templateVersionId,
  };
}

describe("invitation publication requests", () => {
  it("pins the validated Garden Promise draft and requests publication idempotently", async () => {
    const client = createPublicationClient(storedDraft());

    const result = await requestInvitationPublication(client as never, {
      expectedRevision: 4,
      idempotencyKey,
      invitationId,
    });

    expect(result.publicationId).toBe(publicationId);
    expect(result.snapshot).toMatchObject({
      snapshotVersion: 1,
      invitationSchemaVersion: 1,
      rendererKey: "garden-promise-v1",
      rendererVersion: 1,
      templateVersionId: gardenPromise.templateVersionId,
      templateVersion: 1,
      draftRevision: 4,
      document: gardenPromise.defaultDocument,
      assets: [],
    });
    expect(client.rpc).toHaveBeenCalledWith("request_invitation_publication", {
      p_expected_draft_revision: 4,
      p_idempotency_key: idempotencyKey,
      p_invitation_id: invitationId,
      p_snapshot: result.snapshot,
    });
  });

  it("rejects stale revisions before creating a publication request", async () => {
    const client = createPublicationClient(storedDraft(gardenPromise.defaultDocument, 5));

    await expect(
      requestInvitationPublication(client as never, {
        expectedRevision: 4,
        idempotencyKey,
        invitationId,
      }),
    ).rejects.toBeInstanceOf(InvitationDraftConflictError);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects drafts that RLS does not expose", async () => {
    const client = createPublicationClient(null);

    await expect(
      requestInvitationPublication(client as never, {
        expectedRevision: 4,
        idempotencyKey,
        invitationId,
      }),
    ).rejects.toBeInstanceOf(InvitationDraftPersistenceError);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("stops a referenced image with no ready media row before the database request", async () => {
    const client = createPublicationClient(
      storedDraft({
        ...gardenPromise.defaultDocument,
        assets: [{ id: "93000000-0000-4000-8000-000000000001", kind: "image" }],
      }),
      { data: publicationId, error: null },
      null,
    );

    await expect(
      requestInvitationPublication(
        client as never,
        { expectedRevision: 4, idempotencyKey, invitationId },
        { store: noopMediaStore },
      ),
    ).rejects.toBeInstanceOf(PublicationAssetsUnavailableError);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("resolves referenced media into the snapshot manifest and publishes", async () => {
    const assetId = "93000000-0000-4000-8000-000000000002";
    const client = createPublicationClient(
      storedDraft({
        ...gardenPromise.defaultDocument,
        assets: [{ id: assetId, kind: "image" }],
      }),
      { data: publicationId, error: null },
      {
        height: 1200,
        id: assetId,
        renditions: [{ byteLength: 12000, height: 240, sha256: "a".repeat(64), width: 320 }],
        width: 1600,
      },
    );

    const result = await requestInvitationPublication(
      client as never,
      { expectedRevision: 4, idempotencyKey, invitationId },
      { store: noopMediaStore },
    );

    expect(result.snapshot.assets).toEqual([
      {
        contentType: "image/webp",
        height: 1200,
        id: assetId,
        kind: "image",
        renditions: [
          {
            byteLength: 12000,
            height: 240,
            objectKey: `publication-media/v1/${"a".repeat(64)}/w320.webp`,
            sha256: "a".repeat(64),
            width: 320,
          },
        ],
        width: 1600,
      },
    ]);
    expect(client.rpc).toHaveBeenCalledWith("request_invitation_publication", expect.anything());
  });

  it("publishes a Little Blessings invitation under its own renderer", async () => {
    const assetId = "93000000-0000-4000-8000-000000000003";
    const littleBlessings = resolveTemplateById("little-blessings");
    const starter = littleBlessings.starterDocument;

    if (!starter) {
      throw new Error("Little Blessings must ship a starter document.");
    }

    const document = {
      ...starter,
      assets: [{ id: assetId, kind: "image" as const }],
      sections: starter.sections.map((section) =>
        section.type === "hero"
          ? { ...section, props: { ...section.props, imageAssetId: assetId } }
          : section,
      ),
    };
    const client = createPublicationClient(
      {
        document,
        invitation_id: invitationId,
        revision: 4,
        template_version_id: littleBlessings.templateVersionId,
      },
      { data: publicationId, error: null },
      {
        height: 1500,
        id: assetId,
        renditions: [{ byteLength: 18000, height: 400, sha256: "b".repeat(64), width: 320 }],
        width: 1200,
      },
    );

    const result = await requestInvitationPublication(
      client as never,
      { expectedRevision: 4, idempotencyKey, invitationId },
      { store: noopMediaStore },
    );

    expect(result.snapshot).toMatchObject({
      rendererKey: littleBlessings.rendererKey,
      templateVersionId: littleBlessings.templateVersionId,
    });
    expect(result.snapshot.assets.map((asset) => asset.id)).toEqual([assetId]);
  });

  it("maps database revision conflicts without exposing provider details", async () => {
    const client = createPublicationClient(storedDraft(), {
      data: null,
      error: { code: "40001", message: "provider details" },
    });

    await expect(
      requestInvitationPublication(client as never, {
        expectedRevision: 4,
        idempotencyKey,
        invitationId,
      }),
    ).rejects.toBeInstanceOf(InvitationDraftConflictError);
  });

  it("maps other persistence failures without exposing provider details", async () => {
    const client = createPublicationClient(storedDraft(), {
      data: null,
      error: { code: "22023", message: "provider details" },
    });

    await expect(
      requestInvitationPublication(client as never, {
        expectedRevision: 4,
        idempotencyKey,
        invitationId,
      }),
    ).rejects.toBeInstanceOf(PublicationPersistenceError);
  });
});

function statusClient(records: { alias?: unknown; build?: unknown; version: unknown }) {
  const from = vi.fn((table: string) => {
    if (table === "publication_versions") {
      const maybeSingle = vi.fn().mockResolvedValue({ data: records.version, error: null });
      const limit = vi.fn().mockReturnValue({ maybeSingle });
      const order = vi.fn().mockReturnValue({ limit });
      const eq = vi.fn().mockReturnValue({ order });
      return { select: vi.fn().mockReturnValue({ eq }) };
    }
    const data = table === "publication_builds" ? records.build : records.alias;
    const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    return { select: vi.fn().mockReturnValue({ eq }) };
  });
  return { from };
}

describe("invitation publication status", () => {
  it("reports an invitation with no publication as idle", async () => {
    const client = statusClient({ version: null });
    await expect(loadInvitationPublicationStatus(client as never, invitationId)).resolves.toEqual({
      errorCode: null,
      livePublicIdentifier: null,
      publicationId: null,
      publishedRevision: null,
      status: "idle",
    });
  });

  it("exposes a guest identifier only after confirmed delivery", async () => {
    const client = statusClient({
      version: { id: publicationId, draft_revision: 4 },
      build: { error_code: null, status: "completed" },
      alias: {
        active_publication_id: publicationId,
        delivered_publication_id: publicationId,
        delivery_error_code: null,
        delivery_status: "delivered",
        public_identifier: "0123456789abcdef0123456789abcdef",
      },
    });
    await expect(loadInvitationPublicationStatus(client as never, invitationId)).resolves.toEqual({
      errorCode: null,
      livePublicIdentifier: "0123456789abcdef0123456789abcdef",
      publicationId,
      publishedRevision: 4,
      status: "delivered",
    });
  });

  it("keeps a failed undelivered publication link private", async () => {
    const client = statusClient({
      version: { id: publicationId, draft_revision: 4 },
      build: { error_code: "artifact_conflict", status: "failed" },
      alias: {
        active_publication_id: null,
        delivered_publication_id: null,
        delivery_error_code: null,
        delivery_status: "idle",
        public_identifier: "0123456789abcdef0123456789abcdef",
      },
    });
    await expect(
      loadInvitationPublicationStatus(client as never, invitationId),
    ).resolves.toMatchObject({
      errorCode: "artifact_conflict",
      livePublicIdentifier: null,
      status: "failed",
    });
  });

  it("stops treating an old unclaimed build as actively publishing", async () => {
    const client = statusClient({
      version: { id: publicationId, draft_revision: 4 },
      build: {
        attempt_count: 0,
        created_at: "2020-01-01T00:00:00+00:00",
        error_code: null,
        last_started_at: null,
        status: "pending",
      },
      alias: {
        active_publication_id: null,
        delivered_publication_id: null,
        delivery_error_code: null,
        delivery_status: "idle",
        public_identifier: "0123456789abcdef0123456789abcdef",
      },
    });

    await expect(
      loadInvitationPublicationStatus(client as never, invitationId),
    ).resolves.toMatchObject({
      errorCode: "publication_stalled",
      livePublicIdentifier: null,
      status: "failed",
    });
  });
});
