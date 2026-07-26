import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvitationDeleteButton } from "../src/components/invitations/InvitationDeleteButton";
import { deleteInvitationAction } from "../src/server/invitations/actions";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("../src/server/invitations/actions", () => ({
  deleteInvitationAction: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  refresh.mockReset();
  vi.mocked(deleteInvitationAction).mockReset();
});

describe("invitation delete button", () => {
  it("requires explicit confirmation and supports Escape", () => {
    render(
      <InvitationDeleteButton
        invitationId="71000000-0000-4000-8000-000000000001"
        title="Mara & Joaquin"
      />,
    );
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);
    expect(screen.getByRole("dialog").textContent).toContain("Mara & Joaquin");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep invitation" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(deleteButton);
    expect(deleteInvitationAction).not.toHaveBeenCalled();
  });

  it("refreshes the invitation library after confirmed deletion", async () => {
    vi.mocked(deleteInvitationAction).mockResolvedValue({ status: "deleted" });
    render(
      <InvitationDeleteButton
        invitationId="71000000-0000-4000-8000-000000000001"
        title="Mara & Joaquin"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(deleteInvitationAction).toHaveBeenCalledWith({
      invitationId: "71000000-0000-4000-8000-000000000001",
    });
  });

  it("recovers when the deletion request is rejected", async () => {
    vi.mocked(deleteInvitationAction).mockRejectedValue(new Error("Network unavailable"));
    render(
      <InvitationDeleteButton
        invitationId="71000000-0000-4000-8000-000000000001"
        title="Mara & Joaquin"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Check your connection"),
    );
    expect(screen.getByRole("button", { name: "Delete permanently" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
