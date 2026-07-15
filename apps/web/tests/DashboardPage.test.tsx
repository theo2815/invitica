import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "../app/dashboard/page";
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

describe("creator dashboard", () => {
  it("renders an honest empty workspace with working navigation", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: "workspace-id",
    });

    render(await DashboardPage());

    expect(screen.getByRole("heading", { level: 1, name: "Good morning, Maria." })).toBeDefined();
    expect(
      screen.getByRole("heading", { level: 2, name: "Create something worth opening." }),
    ).toBeDefined();
    expect(screen.getByText("No invitations yet")).toBeDefined();
    expect(screen.getByRole("link", { name: "Create invitation" }).getAttribute("href")).toBe(
      "/dashboard/templates",
    );
    expect(screen.getByRole("link", { name: "Browse templates" }).getAttribute("href")).toBe(
      "/dashboard/templates",
    );
    expect(screen.getByRole("link", { name: "Manage guests & RSVPs" }).getAttribute("href")).toBe(
      "/dashboard/guests",
    );
    expect(screen.getByRole("navigation", { name: "Creator workspace" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(2);
    expect(screen.getByText("maria@example.com")).toBeDefined();
  });

  it("keeps the workspace shell available when provisioning fails", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: { message: "Migration missing" } as never,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: null,
    });

    render(await DashboardPage());

    expect(screen.getByRole("alert").textContent).toContain("Your workspace needs attention");
    expect(screen.getAllByRole("link", { name: "Invitica home" })).toHaveLength(2);
    expect(screen.queryByText("No invitations yet")).toBeNull();
  });
});
