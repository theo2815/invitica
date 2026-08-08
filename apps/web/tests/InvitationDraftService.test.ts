import type { InvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById, resolveTemplateVersion } from "@invitica/template-kit";
import { describe, expect, it, vi } from "vitest";

import {
  createInitialInvitationDraft,
  deleteInvitation,
  InvitationDraftConflictError,
  InvitationDraftPersistenceError,
  listInvitationDrafts,
  loadInvitationDraft,
  saveGardenPromiseDraft,
  TemplateUnavailableError,
} from "../src/server/invitations/drafts";

const invitationId = "71000000-0000-4000-8000-000000000001";
const workspaceId = "72000000-0000-4000-8000-000000000001";
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

  it("creates a Little Blessings draft from the starter rather than the showcase", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: invitationId, error: null });
    const littleBlessings = resolveTemplateById("little-blessings");

    await expect(
      createInitialInvitationDraft({ rpc } as never, {
        invitationId,
        templateVersionId: littleBlessings.templateVersionId,
      }),
    ).resolves.toBe(invitationId);

    const [, args] = rpc.mock.calls[0] as [string, { p_document: InvitationDocument }];

    // The showcase's fifteen photographs belong to the catalog. A draft that
    // declared them could never be published, because none of them has uploaded
    // media in this invitation.
    expect(littleBlessings.defaultDocument.assets).toHaveLength(15);
    expect(args.p_document.assets).toEqual([]);
    expect(args.p_document).toEqual(littleBlessings.starterDocument);
  });

  it("rejects fixture templates before persistence", async () => {
    const rpc = vi.fn();
    const fixture = resolveTemplateVersion("40000000-0000-4000-8000-000000000002");

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

describe("invitation deletion", () => {
  it("deletes through the owner-authorized RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await expect(deleteInvitation({ rpc } as never, invitationId)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("delete_invitation", { p_invitation_id: invitationId });
  });

  it("no longer refuses a published invitation", async () => {
    // `0007` raised 55000 for any invitation with a publication record. `0031`
    // has no such branch, so the code carries no special meaning here.
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "55000" } });

    await expect(deleteInvitation({ rpc } as never, invitationId)).rejects.toBeInstanceOf(
      InvitationDraftPersistenceError,
    );
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

    const hero = gardenPromise.defaultDocument.sections.find((section) => section.type === "hero");
    const venue = gardenPromise.defaultDocument.sections.find(
      (section) => section.type === "venue",
    );
    const rsvp = gardenPromise.defaultDocument.sections.find((section) => section.type === "rsvp");
    if (!hero || !venue || !rsvp) throw new Error("Expected Garden Promise editor sections");

    expect(rpc).toHaveBeenCalledWith("update_invitation_sections", {
      p_expected_revision: 1,
      p_invitation_id: invitationId,
      p_section_updates: [
        {
          id: hero.id,
          props: {
            ...hero.props,
            dateLabel: "February 14, 2027",
            subtitle: "Celebrate with us",
            title: "Lira & Mateo",
          },
          visible: hero.visible,
        },
        {
          id: venue.id,
          props: {
            ...venue.props,
            address: "123 Garden Road, Tagaytay",
            mapUrl: "https://maps.example.test/garden",
            venueName: "The Glass Garden",
          },
          visible: venue.visible,
        },
        {
          id: rsvp.id,
          props: {
            ...rsvp.props,
            deadline: "2027-02-01T23:59:59+08:00",
            message: "Please reply by February 1.",
          },
          visible: rsvp.visible,
        },
      ],
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
