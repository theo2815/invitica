import { resolveTemplateById } from "@invitica/template-kit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensurePersonalWorkspace } from "../src/server/auth/session";
import {
  createInvitationDraftAction,
  deleteInvitationAction,
  publishInvitationAction,
  saveGardenPromiseAction,
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
}));

vi.mock("../src/server/invitations/publication-jobs", () => ({
  enqueueInvitationPublication: vi.fn(),
  PublicationEnqueueError: class PublicationEnqueueError extends Error {},
}));

const invitationId = "71000000-0000-4000-8000-000000000001";
const publicationId = "92000000-0000-4000-8000-000000000001";
const gardenPromise = resolveTemplateById("garden-promise");
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
  vi.mocked(enqueueInvitationPublication).mockReset();
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
    const fixture = resolveTemplateById("golden-hour");
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
    expect(ensurePersonalWorkspace).not.toHaveBeenCalled();
  });

  it("returns the persisted revision after a validated save", async () => {
    const query = createDraftQueryResult(1);
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: { from: query.from, rpc } as never,
      user: {} as never,
      workspaceId: "workspace-id",
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
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: { from: query.from, rpc } as never,
      user: {} as never,
      workspaceId: "workspace-id",
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

describe("publish invitation action", () => {
  it("requests the saved revision and enqueues only its public publication ID", async () => {
    const query = createDraftQueryResult(1);
    const rpc = vi.fn().mockResolvedValue({ data: publicationId, error: null });
    vi.mocked(enqueueInvitationPublication).mockResolvedValue();
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: { from: query.from, rpc } as never,
      user: {} as never,
      workspaceId: "workspace-id",
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
  it("deletes an unpublished invitation and refreshes the library", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: { rpc } as never,
      user: {} as never,
      workspaceId: "workspace-id",
    });

    await expect(deleteInvitationAction({ invitationId })).resolves.toEqual({
      status: "deleted",
    });
    expect(rpc).toHaveBeenCalledWith("delete_unpublished_invitation", {
      p_invitation_id: invitationId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/invitations");
  });
});
