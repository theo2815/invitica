import {
  resolveTemplateById,
  resolveTemplateVersion,
  templateStarterDocument,
} from "@invitica/template-kit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensurePersonalWorkspace, requireConfirmedUser } from "../src/server/auth/session";
import {
  createInvitationDraftAction,
  deleteInvitationAction,
  publishInvitationAction,
  saveGardenPromiseAction,
  upgradeInvitationTemplateAction,
} from "../src/server/invitations/actions";
import { enqueueInvitationPublication } from "../src/server/invitations/publication-jobs";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("../src/server/auth/session", () => ({
  ensurePersonalWorkspace: vi.fn(),
  requireConfirmedUser: vi.fn(),
}));

vi.mock("../src/server/invitations/publication-jobs", () => ({
  enqueueInvitationPublication: vi.fn(),
  PublicationEnqueueError: class PublicationEnqueueError extends Error {},
}));

/** Records the exact order the deletion path removes objects from R2. */
const deletedKeys: string[] = [];
const deleteObject = vi.fn(async (key: string) => {
  deletedKeys.push(key);
});

vi.mock("../src/server/media/object-store", () => ({
  R2MediaObjectStore: class {
    delete = deleteObject;
  },
  readR2MediaConfig: () => ({
    accessKeyId: "key",
    bucket: "invitica-storage",
    endpoint: "https://example.r2.cloudflarestorage.com",
    secretAccessKey: "secret",
  }),
}));
const littleBlessingsV1 = resolveTemplateVersion("40000000-0000-4000-8000-000000000004");

const invitationId = "71000000-0000-4000-8000-000000000001";
const publicationId = "92000000-0000-4000-8000-000000000001";
const gardenPromise = resolveTemplateVersion("40000000-0000-4000-8000-000000000001");
const gardenPromiseFields = {
  dateLabel: "February 14, 2027",
  mapUrl: "https://maps.example.test/garden",
  rsvpDeadline: "2027-02-01",
  rsvpMessage: "Please reply by February 1.",
  subtitle: "Celebrate with us",
  title: "Lira & Mateo",
  venueAddress: "123 Garden Road, Tagaytay",
  venueName: "The Glass Garden",
};

function createForm(templateVersionId = gardenPromise.templateVersionId) {
  const formData = new FormData();
  formData.set("invitationId", invitationId);
  formData.set("templateVersionId", templateVersionId);
  return formData;
}

function createDraftQueryResult(revision: number) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      document: gardenPromise.defaultDocument,
      invitation_id: invitationId,
      revision,
      template_version_id: gardenPromise.templateVersionId,
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return { from };
}

beforeEach(() => {
  vi.mocked(redirect).mockReset();
  vi.mocked(revalidatePath).mockReset();
  vi.mocked(ensurePersonalWorkspace).mockReset();
  vi.mocked(requireConfirmedUser).mockReset();
  vi.mocked(enqueueInvitationPublication).mockReset();
  deletedKeys.length = 0;
  deleteObject.mockReset();
  deleteObject.mockImplementation(async (key: string) => {
    deletedKeys.push(key);
  });
});

describe("create invitation draft action", () => {
  it("rejects malformed requests before accessing the workspace", async () => {
    const result = await createInvitationDraftAction({ error: null }, new FormData());

    expect(result.error).toContain("no longer valid");
    expect(ensurePersonalWorkspace).not.toHaveBeenCalled();
  });

  it("reuses the same invitation identifier across repeated submissions", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: invitationId, error: null });
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: { rpc } as never,
      user: {} as never,
      workspaceId: "workspace-id",
    });

    await createInvitationDraftAction({ error: null }, createForm());
    await createInvitationDraftAction({ error: null }, createForm());

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_invitation_id: invitationId });
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_invitation_id: invitationId });
    expect(redirect).toHaveBeenCalledTimes(2);
    expect(redirect).toHaveBeenCalledWith(`/dashboard/invitations/${invitationId}`);
  });

  it("returns an honest workspace error without attempting persistence", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: { message: "unavailable" } as never,
      supabase: { rpc: vi.fn() } as never,
      user: {} as never,
      workspaceId: null,
    });

    const result = await createInvitationDraftAction({ error: null }, createForm());

    expect(result.error).toContain("workspace is unavailable");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("keeps renderer fixtures unavailable", async () => {
    const rpc = vi.fn();
    const fixture = resolveTemplateVersion("40000000-0000-4000-8000-000000000002");
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: { rpc } as never,
      user: {} as never,
      workspaceId: "workspace-id",
    });

    const result = await createInvitationDraftAction(
      { error: null },
      createForm(fixture.templateVersionId),
    );

    expect(result.error).toContain("not available");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("save Garden Promise action", () => {
  it("rejects unsafe map links before accessing the workspace", async () => {
    await expect(
      saveGardenPromiseAction({
        ...gardenPromiseFields,
        expectedRevision: 1,
        invitationId,
        mapUrl: "javascript:alert('unsafe')",
      }),
    ).resolves.toMatchObject({ status: "error" });
    expect(requireConfirmedUser).not.toHaveBeenCalled();
  });

  it("returns the persisted revision after a validated save", async () => {
    const query = createDraftQueryResult(1);
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    vi.mocked(requireConfirmedUser).mockResolvedValue({
      supabase: { from: query.from, rpc } as never,
      user: {} as never,
    });

    await expect(
      saveGardenPromiseAction({
        ...gardenPromiseFields,
        expectedRevision: 1,
        invitationId,
      }),
    ).resolves.toEqual({ revision: 2, status: "saved" });
  });

  it("returns a recoverable conflict without attempting a stale save", async () => {
    const query = createDraftQueryResult(2);
    const rpc = vi.fn();
    vi.mocked(requireConfirmedUser).mockResolvedValue({
      supabase: { from: query.from, rpc } as never,
      user: {} as never,
    });

    await expect(
      saveGardenPromiseAction({
        ...gardenPromiseFields,
        expectedRevision: 1,
        invitationId,
      }),
    ).resolves.toMatchObject({ status: "conflict" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("upgrade invitation template action", () => {
  it("applies the declared transition and revalidates the editor route", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        document: templateStarterDocument(littleBlessingsV1),
        invitation_id: invitationId,
        revision: 4,
        template_version_id: littleBlessingsV1.templateVersionId,
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const rpc = vi.fn().mockResolvedValue({ data: 5, error: null });
    vi.mocked(requireConfirmedUser).mockResolvedValue({
      supabase: { from, rpc } as never,
      user: {} as never,
    });
    const latest = resolveTemplateById("little-blessings");

    await expect(
      upgradeInvitationTemplateAction({
        currentTemplateVersionId: littleBlessingsV1.templateVersionId,
        expectedRevision: 4,
        invitationId,
        targetTemplateVersionId: latest.templateVersionId,
      }),
    ).resolves.toEqual({
      revision: 5,
      status: "updated",
      templateVersionId: latest.templateVersionId,
    });
    expect(rpc).toHaveBeenCalledWith(
      "upgrade_invitation_template",
      expect.objectContaining({
        p_from_template_version_id: littleBlessingsV1.templateVersionId,
        p_to_template_version_id: latest.templateVersionId,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/invitations/${invitationId}`);
  });
});

describe("publish invitation action", () => {
  it("requests the saved revision and enqueues only its public publication ID", async () => {
    const query = createDraftQueryResult(1);
    const rpc = vi.fn().mockResolvedValue({ data: publicationId, error: null });
    vi.mocked(enqueueInvitationPublication).mockResolvedValue();
    vi.mocked(requireConfirmedUser).mockResolvedValue({
      supabase: { from: query.from, rpc } as never,
      user: {} as never,
    });

    await expect(
      publishInvitationAction({
        expectedRevision: 1,
        idempotencyKey: "91000000-0000-4000-8000-000000000001",
        invitationId,
      }),
    ).resolves.toEqual({ publicationId, status: "accepted" });
    expect(enqueueInvitationPublication).toHaveBeenCalledWith(
      publicationId,
      "91000000-0000-4000-8000-000000000001",
    );
    expect(enqueueInvitationPublication).toHaveBeenCalledTimes(1);
  });
});

describe("delete invitation action", () => {
  const publicIdentifier = "b1b2b3b4b5b6b7b8b9b0b1b2b3b4b5b6";
  const artifactKey = "publication-artifacts/v2/92000000-0000-4000-8000-000000000001.json";

  /**
   * `publication_aliases` is queried with one `eq`, `publication_builds` with two,
   * and both are awaited on the builder itself.
   */
  function createPublicationQueries(published: boolean) {
    const aliasResult = Promise.resolve({
      data: published ? [{ public_identifier: publicIdentifier }] : [],
      error: null,
    });
    const buildResult = Promise.resolve({
      data: published ? [{ artifact_key: artifactKey }] : [],
      error: null,
    });

    return vi.fn().mockImplementation((table: string) => ({
      select: vi
        .fn()
        .mockReturnValue(
          table === "publication_aliases"
            ? { eq: vi.fn().mockReturnValue(aliasResult) }
            : { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(buildResult) }) },
        ),
    }));
  }

  it("deletes an unpublished invitation without reaching for the object store", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(requireConfirmedUser).mockResolvedValue({
      supabase: { from: createPublicationQueries(false), rpc } as never,
      user: {} as never,
    });

    await expect(deleteInvitationAction({ invitationId })).resolves.toEqual({
      status: "deleted",
    });
    expect(rpc).toHaveBeenCalledWith("delete_invitation", { p_invitation_id: invitationId });
    expect(deletedKeys).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/invitations");
  });

  it("closes the guest link before deleting a published invitation's records", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(requireConfirmedUser).mockResolvedValue({
      supabase: { from: createPublicationQueries(true), rpc } as never,
      user: {} as never,
    });

    await expect(deleteInvitationAction({ invitationId })).resolves.toEqual({
      status: "deleted",
    });
    // The alias is what the Viewer resolves, so it goes first and alone.
    expect(deletedKeys).toEqual([`publication-aliases/v1/${publicIdentifier}.json`, artifactKey]);
    expect(rpc).toHaveBeenCalledWith("delete_invitation", { p_invitation_id: invitationId });
  });

  it("keeps the records when the guest link cannot be closed", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    deleteObject.mockRejectedValue(new Error("R2 unavailable"));
    vi.mocked(requireConfirmedUser).mockResolvedValue({
      supabase: { from: createPublicationQueries(true), rpc } as never,
      user: {} as never,
    });

    await expect(deleteInvitationAction({ invitationId })).resolves.toEqual({
      message:
        "The shared link could not be taken down, so nothing was deleted. Try again in a moment.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
