import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById, templateRegistry } from "@invitica/template-kit";
import { describe, expect, it, vi } from "vitest";

import {
  InvitationDraftConflictError,
  InvitationDraftPersistenceError,
  TemplateUnavailableError,
} from "../src/server/invitations/drafts";
import { saveSectionDocumentDraft } from "../src/server/invitations/little-blessings";

const invitationId = "71000000-0000-4000-8000-000000000001";
const littleBlessings = resolveTemplateById("little-blessings");
const document = parseInvitationDocument(structuredClone(littleBlessings.defaultDocument));

function heroDetails(title = "Eliana Grace") {
  return { hero: { props: { title }, visible: true as const } };
}

function createSupabase(
  draft: {
    document: unknown;
    revision: number;
    templateVersionId: string;
  },
  rpcResult: { data?: unknown; error?: { code?: string } | null } = { data: 2, error: null },
) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      document: draft.document,
      invitation_id: invitationId,
      revision: draft.revision,
      template_version_id: draft.templateVersionId,
    },
    error: null,
  });
  const rpc = vi.fn().mockResolvedValue({ data: rpcResult.data ?? null, error: rpcResult.error });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    }),
    rpc,
  };
}

describe("saving a section-document draft", () => {
  it("sends the validated section payload to the bounded RPC", async () => {
    const supabase = createSupabase({
      document,
      revision: 1,
      templateVersionId: littleBlessings.templateVersionId,
    });

    await expect(
      saveSectionDocumentDraft(supabase as never, {
        details: heroDetails(),
        expectedRevision: 1,
        invitationId,
      }),
    ).resolves.toBe(2);

    const hero = document.sections.find((section) => section.type === "hero");
    if (!hero) throw new Error("Expected the hero section");

    expect(supabase.rpc).toHaveBeenCalledWith("update_invitation_sections", {
      p_expected_revision: 1,
      p_invitation_id: invitationId,
      p_section_updates: [
        {
          id: hero.id,
          props: { title: "Eliana Grace" },
          visible: true,
        },
      ],
    });
  });

  it.each([
    "garden-promise",
    "golden-hour",
    "sunday-joy",
  ] as const)("saves a %s section document through the shared bounded path", async (templateId) => {
    const template = resolveTemplateById(templateId);
    const occasionDocument = parseInvitationDocument(structuredClone(template.defaultDocument));
    const supabase = createSupabase({
      document: occasionDocument,
      revision: 1,
      templateVersionId: template.templateVersionId,
    });

    await expect(
      saveSectionDocumentDraft(supabase as never, {
        details: heroDetails(`${template.listing.name} updated`),
        expectedRevision: 1,
        invitationId,
      }),
    ).resolves.toBe(2);
    expect(supabase.rpc).toHaveBeenCalledOnce();
  });

  it("refuses a template assigned to a different editor contract", async () => {
    const focusedTemplate = templateRegistry.find(
      (template) => template.rendererKey === "garden-promise-v1",
    );
    if (!focusedTemplate) throw new Error("Expected the focused Garden Promise version");

    const focusedDocument = parseInvitationDocument(
      structuredClone(focusedTemplate.defaultDocument),
    );
    const supabase = createSupabase({
      document: focusedDocument,
      revision: 1,
      templateVersionId: focusedTemplate.templateVersionId,
    });

    await expect(
      saveSectionDocumentDraft(supabase as never, {
        details: heroDetails(),
        expectedRevision: 1,
        invitationId,
      }),
    ).rejects.toBeInstanceOf(TemplateUnavailableError);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("reports a stale revision before writing anything", async () => {
    const supabase = createSupabase({
      document,
      revision: 4,
      templateVersionId: littleBlessings.templateVersionId,
    });

    await expect(
      saveSectionDocumentDraft(supabase as never, {
        details: heroDetails(),
        expectedRevision: 1,
        invitationId,
      }),
    ).rejects.toBeInstanceOf(InvitationDraftConflictError);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("turns a database revision conflict into a recoverable conflict", async () => {
    const supabase = createSupabase(
      { document, revision: 1, templateVersionId: littleBlessings.templateVersionId },
      { error: { code: "40001" } },
    );

    await expect(
      saveSectionDocumentDraft(supabase as never, {
        details: heroDetails(),
        expectedRevision: 1,
        invitationId,
      }),
    ).rejects.toBeInstanceOf(InvitationDraftConflictError);
  });

  it("reports any other database failure as a persistence error", async () => {
    const supabase = createSupabase(
      { document, revision: 1, templateVersionId: littleBlessings.templateVersionId },
      { error: { code: "23514" } },
    );

    await expect(
      saveSectionDocumentDraft(supabase as never, {
        details: heroDetails(),
        expectedRevision: 1,
        invitationId,
      }),
    ).rejects.toBeInstanceOf(InvitationDraftPersistenceError);
  });

  it("rejects a payload that would hide a required section before the database sees it", async () => {
    const supabase = createSupabase({
      document,
      revision: 1,
      templateVersionId: littleBlessings.templateVersionId,
    });

    await expect(
      saveSectionDocumentDraft(supabase as never, {
        details: { hero: { props: { title: "Eliana Grace" }, visible: false } },
        expectedRevision: 1,
        invitationId,
      }),
    ).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects a ninth gift idea before the database sees it", async () => {
    const gifts = document.sections.find((section) => section.type === "gifts");
    if (gifts?.type !== "gifts") throw new Error("Expected the gifts section");
    const supabase = createSupabase({
      document,
      revision: 1,
      templateVersionId: littleBlessings.templateVersionId,
    });

    await expect(
      saveSectionDocumentDraft(supabase as never, {
        details: {
          gifts: {
            props: { items: [...gifts.props.items, { name: "One too many" }] },
            visible: true,
          },
        },
        expectedRevision: 1,
        invitationId,
      }),
    ).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
