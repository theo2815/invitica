import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InvitationsError from "../app/dashboard/invitations/error";
import InvitationsLoading from "../app/dashboard/invitations/loading";
import InvitationsPage from "../app/dashboard/invitations/page";
import { ensurePersonalWorkspace } from "../src/server/auth/session";

vi.mock("../src/server/auth/actions", () => ({
  signOut: vi.fn(),
}));

vi.mock("../src/server/auth/session", () => ({
  ensurePersonalWorkspace: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(ensurePersonalWorkspace).mockReset();
});

describe("invitations page", () => {
  it("renders the dedicated invitation library empty state", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: "workspace-id",
    });

    render(await InvitationsPage());

    expect(screen.getByRole("heading", { level: 1, name: "Invitations" })).toBeDefined();
    expect(
      screen.getByRole("heading", { level: 2, name: "Your first invitation begins here." }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "New invitation" }).getAttribute("href")).toBe(
      "/dashboard/templates",
    );
    expect(
      screen.getByRole("link", { name: "Create your first invitation" }).getAttribute("href"),
    ).toBe("/dashboard/templates");
    expect(screen.getAllByRole("link", { name: "Invitations" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Invitations" })[0]?.getAttribute("href")).toBe(
      "/dashboard/invitations",
    );
    expect(screen.getByText("maria@example.com")).toBeDefined();
  });

  it("shows the workspace provisioning failure without claiming an empty library", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: { message: "Migration missing" } as never,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: null,
    });

    render(await InvitationsPage());

    expect(screen.getByRole("alert").textContent).toContain("Your workspace needs attention");
    expect(screen.queryByText("Your first invitation begins here.")).toBeNull();
  });

  it("renders a labelled route loading state", () => {
    render(<InvitationsLoading />);

    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Loading invitations");
  });

  it("offers recovery when an unexpected route error occurs", () => {
    const reset = vi.fn();

    render(<InvitationsError error={new Error("Unavailable")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("alert").textContent).toContain("Invitations could not be loaded");
    expect(reset).toHaveBeenCalledOnce();
  });
});
