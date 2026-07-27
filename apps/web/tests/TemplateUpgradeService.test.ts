import {
  resolveTemplateById,
  resolveTemplateVersion,
  templateStarterDocument,
} from "@invitica/template-kit";
import { describe, expect, it, vi } from "vitest";

import { InvitationDraftConflictError } from "../src/server/invitations/drafts";
import {
  TemplateUpgradeUnavailableError,
  upgradeInvitationTemplate,
} from "../src/server/invitations/template-upgrades";

const invitationId = "71000000-0000-4000-8000-000000000001";
const littleBlessingsV1 = resolveTemplateVersion("40000000-0000-4000-8000-000000000004");
const littleBlessingsV2 = resolveTemplateById("little-blessings");

function creatorDocument() {
  const document = structuredClone(templateStarterDocument(littleBlessingsV1));
  const hero = document.sections.find((section) => section.type === "hero");
  if (!hero) throw new Error("Little Blessings hero is required");
  hero.props.title = "Creator-owned name";
  return document;
}

function supabaseForDraft(
  revision = 4,
  rpcResult: { data: number | null; error: { code: string; message: string } | null } = {
    data: 5,
    error: null,
  },
) {
  const document = creatorDocument();
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      document,
      invitation_id: invitationId,
      revision,
      template_version_id: littleBlessingsV1.templateVersionId,
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn().mockResolvedValue(rpcResult);

  return { document, from, rpc };
}

describe("template upgrade service", () => {
  it("sends an exact version-pin-only migration to the guarded RPC", async () => {
    const supabase = supabaseForDraft();

    await expect(
      upgradeInvitationTemplate(supabase as never, {
        currentTemplateVersionId: littleBlessingsV1.templateVersionId,
        expectedRevision: 4,
        invitationId,
        targetTemplateVersionId: littleBlessingsV2.templateVersionId,
      }),
    ).resolves.toEqual({
      revision: 5,
      templateVersionId: littleBlessingsV2.templateVersionId,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("upgrade_invitation_template", {
      p_document: {
        ...supabase.document,
        templateVersionId: littleBlessingsV2.templateVersionId,
      },
      p_expected_revision: 4,
      p_from_template_version_id: littleBlessingsV1.templateVersionId,
      p_invitation_id: invitationId,
      p_to_template_version_id: littleBlessingsV2.templateVersionId,
    });
  });

  it("rejects a stale revision before requesting a migration", async () => {
    const supabase = supabaseForDraft(5);

    await expect(
      upgradeInvitationTemplate(supabase as never, {
        currentTemplateVersionId: littleBlessingsV1.templateVersionId,
        expectedRevision: 4,
        invitationId,
        targetTemplateVersionId: littleBlessingsV2.templateVersionId,
      }),
    ).rejects.toBeInstanceOf(InvitationDraftConflictError);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects an undeclared target before requesting a migration", async () => {
    const supabase = supabaseForDraft();

    await expect(
      upgradeInvitationTemplate(supabase as never, {
        currentTemplateVersionId: littleBlessingsV1.templateVersionId,
        expectedRevision: 4,
        invitationId,
        targetTemplateVersionId: "40000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toBeInstanceOf(TemplateUpgradeUnavailableError);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the database preservation guard as an unavailable update", async () => {
    const supabase = supabaseForDraft(4, {
      data: null,
      error: { code: "23514", message: "Template upgrade changed creator content" },
    });

    await expect(
      upgradeInvitationTemplate(supabase as never, {
        currentTemplateVersionId: littleBlessingsV1.templateVersionId,
        expectedRevision: 4,
        invitationId,
        targetTemplateVersionId: littleBlessingsV2.templateVersionId,
      }),
    ).rejects.toBeInstanceOf(TemplateUpgradeUnavailableError);
  });
});
