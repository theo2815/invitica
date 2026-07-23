import { resolveTemplateById } from "@invitica/template-kit";
import { describe, expect, it, vi } from "vitest";

import {
  createInitialInvitationDraft,
  deleteUnpublishedInvitation,
  InvitationDeletionUnavailableError,
  InvitationDraftConflictError,
  InvitationDraftPersistenceError,
  listInvitationDrafts,
  loadInvitationDraft,
  saveGardenPromiseDraft,
  TemplateUnavailableError,
} from "../src/server/invitations/drafts";

const invitationId = "71000000-0000-4000-8000-000000000001";
const workspaceId = "72000000-0000-4000-8000-000000000001";
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

function createDraftQueryResult(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return { from, maybeSingle, select };
}

function createDraftListQueryResult(data: unknown, error: unknown = null) {
  const order = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return { eq, from, order, select };
}

describe("initial invitation draft creation", () => {
  it("validates and persists the production template through the atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: invitationId, error: null });

    await expect(
      createInitialInvitationDraft({ rpc } as never, {
        invitationId,
        templateVersionId: gardenPromise.templateVersionId,
      }),
    ).resolves.toBe(invitationId);

    expect(rpc).toHaveBeenCalledWith(
      "create_invitation_draft",
      expect.objectContaining({
        p_document: gardenPromise.defaultDocument,
        p_event_name: "Garden Promise invitation",
        p_invitation_id: invitationId,
        p_occasion: "wedding",
        p_template_version_id: gardenPromise.templateVersionId,
      }),
    );
  });

  it("rejects fixture templates before persistence", async () => {
    const rpc = vi.fn();
    const fixture = resolveTemplateById("golden-hour");

    await expect(
      createInitialInvitationDraft({ rpc } as never, {
        invitationId,
        templateVersionId: fixture.templateVersionId,
      }),
    ).rejects.toBeInstanceOf(TemplateUnavailableError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports persistence failures without exposing provider details", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "provider details" },
    });

    await expect(
      createInitialInvitationDraft({ rpc } as never, {
        invitationId,
        templateVersionId: gardenPromise.templateVersionId,
      }),
    ).rejects.toBeInstanceOf(InvitationDraftPersistenceError);
  });
});

describe("persisted invitation draft loading", () => {
  it("parses a workspace-visible draft before returning it", async () => {
    const query = createDraftQueryResult({
      document: gardenPromise.defaultDocument,
      invitation_id: invitationId,
      revision: 1,
      template_version_id: gardenPromise.templateVersionId,
    });

    const result = await loadInvitationDraft({ from: query.from } as never, invitationId);

    expect(result).toMatchObject({
      document: gardenPromise.defaultDocument,
      invitationId,
      manifest: gardenPromise,
      revision: 1,
    });
    expect(query.from).toHaveBeenCalledWith("invitation_drafts");
  });

  it("returns null when RLS exposes no matching draft", async () => {
    const query = createDraftQueryResult(null);

    await expect(
      loadInvitationDraft({ from: query.from } as never, invitationId),
    ).resolves.toBeNull();
  });

  it("rejects invalid stored documents", async () => {
    const query = createDraftQueryResult({
      document: { schemaVersion: 2, templateVersionId: gardenPromise.templateVersionId },
      invitation_id: invitationId,
      revision: 1,
      template_version_id: gardenPromise.templateVersionId,
    });

    await expect(
      loadInvitationDraft({ from: query.from } as never, invitationId),
    ).rejects.toThrow();
  });
});

describe("persisted invitation draft listing", () => {
  it("returns workspace drafts newest first with display fields from the validated document", async () => {
    const query = createDraftListQueryResult([
      {
        document: gardenPromise.defaultDocument,
        invitation_id: invitationId,
        revision: 2,
        template_version_id: gardenPromise.templateVersionId,
        updated_at: "2026-07-19T04:00:00+00:00",
      },
    ]);

    await expect(listInvitationDrafts({ from: query.from } as never, workspaceId)).resolves.toEqual(
      [
        expect.objectContaining({
          dateLabel: "Sunday, January 17, 2027",
          invitationId,
          manifest: gardenPromise,
          revision: 2,
          templateVersionId: gardenPromise.templateVersionId,
          title: "Mara & Joaquin",
          updatedAt: "2026-07-19T04:00:00+00:00",
        }),
      ],
    );
    expect(query.from).toHaveBeenCalledWith("invitation_drafts");
    expect(query.eq).toHaveBeenCalledWith("workspace_id", workspaceId);
    expect(query.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("returns an empty collection when the workspace has no visible drafts", async () => {
    const query = createDraftListQueryResult([]);

    await expect(listInvitationDrafts({ from: query.from } as never, workspaceId)).resolves.toEqual(
      [],
    );
  });

  it("reports list failures without exposing provider details", async () => {
    const query = createDraftListQueryResult(null, { message: "provider details" });

    await expect(
      listInvitationDrafts({ from: query.from } as never, workspaceId),
    ).rejects.toBeInstanceOf(InvitationDraftPersistenceError);
  });
});

describe("unpublished invitation deletion", () => {
  it("deletes through the owner-authorized RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await expect(
      deleteUnpublishedInvitation({ rpc } as never, invitationId),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("delete_unpublished_invitation", {
      p_invitation_id: invitationId,
    });
  });

  it("keeps submitted invitations behind the revocation boundary", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "55000" } });

    await expect(
      deleteUnpublishedInvitation({ rpc } as never, invitationId),
    ).rejects.toBeInstanceOf(InvitationDeletionUnavailableError);
  });
});

describe("constrained Garden Promise saving", () => {
  it("validates the next document and saves through the revision-aware RPC", async () => {
    const query = createDraftQueryResult({
      document: gardenPromise.defaultDocument,
      invitation_id: invitationId,
      revision: 1,
      template_version_id: gardenPromise.templateVersionId,
    });
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });

    await expect(
      saveGardenPromiseDraft({ from: query.from, rpc } as never, {
        ...gardenPromiseFields,
        dateLabel: "  February 14, 2027  ",
        expectedRevision: 1,
        invitationId,
        mapUrl: "  https://maps.example.test/garden  ",
        rsvpMessage: "  Please reply by February 1.  ",
        subtitle: "  Celebrate with us  ",
        title: "  Lira & Mateo  ",
        venueAddress: "  123 Garden Road, Tagaytay  ",
        venueName: "  The Glass Garden  ",
      }),
    ).resolves.toBe(2);

    expect(rpc).toHaveBeenCalledWith("update_garden_promise_details", {
      p_date_label: "February 14, 2027",
      p_expected_revision: 1,
      p_invitation_id: invitationId,
      p_map_url: "https://maps.example.test/garden",
      p_rsvp_deadline: "2027-02-01",
      p_rsvp_message: "Please reply by February 1.",
      p_subtitle: "Celebrate with us",
      p_title: "Lira & Mateo",
      p_venue_address: "123 Garden Road, Tagaytay",
      p_venue_name: "The Glass Garden",
    });
  });

  it("reports a stale persisted revision as a conflict before saving", async () => {
    const query = createDraftQueryResult({
      document: gardenPromise.defaultDocument,
      invitation_id: invitationId,
      revision: 2,
      template_version_id: gardenPromise.templateVersionId,
    });
    const rpc = vi.fn();

    await expect(
      saveGardenPromiseDraft({ from: query.from, rpc } as never, {
        ...gardenPromiseFields,
        expectedRevision: 1,
        invitationId,
      }),
    ).rejects.toBeInstanceOf(InvitationDraftConflictError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a concurrent RPC revision failure to a conflict", async () => {
    const query = createDraftQueryResult({
      document: gardenPromise.defaultDocument,
      invitation_id: invitationId,
      revision: 1,
      template_version_id: gardenPromise.templateVersionId,
    });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "40001" } });

    await expect(
      saveGardenPromiseDraft({ from: query.from, rpc } as never, {
        ...gardenPromiseFields,
        expectedRevision: 1,
        invitationId,
      }),
    ).rejects.toBeInstanceOf(InvitationDraftConflictError);
  });
});
