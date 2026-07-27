import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TemplateUpgradePanel } from "../src/components/invitations/TemplateUpgradePanel";
import { upgradeInvitationTemplateAction } from "../src/server/invitations/actions";

vi.mock("../src/server/invitations/actions", () => ({
  upgradeInvitationTemplateAction: vi.fn(),
}));

const invitationId = "71000000-0000-4000-8000-000000000001";
const upgrade = {
  currentTemplateVersionId: "40000000-0000-4000-8000-000000000004",
  targetTemplateVersionId: "40000000-0000-4000-8000-000000000005",
  targetVersion: 2,
  templateName: "Little Blessings",
};

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(upgradeInvitationTemplateAction).mockReset();
});

describe("template upgrade panel", () => {
  it("stays absent when the current draft has no declared successor", () => {
    const { container } = render(
      <TemplateUpgradePanel draftReady invitationId={invitationId} revision={4} upgrade={null} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("explains preservation and supports Escape with focus return", () => {
    render(
      <TemplateUpgradePanel
        draftReady
        invitationId={invitationId}
        revision={4}
        upgrade={upgrade}
      />,
    );

    expect(screen.getByText(/photos stay exactly as saved/)).toBeDefined();
    expect(screen.getByText(/published invitation stays live/)).toBeDefined();
    const updateButton = screen.getByRole("button", { name: "Review template update" });
    fireEvent.click(updateButton);

    expect(screen.getByRole("dialog").parentElement?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Keep current version" }),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(updateButton);
    expect(upgradeInvitationTemplateAction).not.toHaveBeenCalled();
  });

  it("applies the pinned transition and requires a reload before further editing", async () => {
    vi.mocked(upgradeInvitationTemplateAction).mockResolvedValue({
      revision: 5,
      status: "updated",
      templateVersionId: upgrade.targetTemplateVersionId,
    });
    render(
      <TemplateUpgradePanel
        draftReady
        invitationId={invitationId}
        revision={4}
        upgrade={upgrade}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review template update" }));
    fireEvent.click(screen.getByRole("button", { name: "Update draft" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reload updated draft" })).toBeDefined(),
    );
    expect(upgradeInvitationTemplateAction).toHaveBeenCalledWith({
      currentTemplateVersionId: upgrade.currentTemplateVersionId,
      expectedRevision: 4,
      invitationId,
      targetTemplateVersionId: upgrade.targetTemplateVersionId,
    });
    expect(screen.getByText(/publish when you are ready/)).toBeDefined();
  });

  it("does not allow an update while the editor has unsaved changes", () => {
    render(
      <TemplateUpgradePanel
        draftReady={false}
        invitationId={invitationId}
        revision={4}
        upgrade={upgrade}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Review template update" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
