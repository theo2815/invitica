import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GuestsError from "../app/dashboard/guests/error";
import GuestsLoading from "../app/dashboard/guests/loading";
import GuestsPage from "../app/dashboard/guests/page";
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

describe("guests and RSVPs page", () => {
  it("renders the protected empty guest-management workspace", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: "workspace-id",
    });

    render(await GuestsPage());

    expect(screen.getByRole("heading", { level: 1, name: "Guests & RSVPs" })).toBeDefined();
    const desktopNavigation = screen.getByRole("navigation", { name: "Creator workspace" });
    const guestsLink = within(desktopNavigation).getByRole("link", { name: "Guests & RSVPs" });
    expect(guestsLink.getAttribute("href")).toBe("/dashboard/guests");
    expect(guestsLink.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("table", { name: "Guest ledger" })).toBeDefined();
    expect(screen.getByText("No invitation selected")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add guest party" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Import guest list" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("link", { name: "View invitations" }).getAttribute("href")).toBe(
      "/dashboard/invitations",
    );
    expect(screen.getByText("maria@example.com")).toBeDefined();
  });

  it("shows the workspace failure instead of the guest ledger", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: { message: "Migration missing" } as never,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: null,
    });

    render(await GuestsPage());

    expect(screen.getByRole("alert").textContent).toContain("Your workspace needs attention");
    expect(screen.queryByRole("table", { name: "Guest ledger" })).toBeNull();
  });

  it("provides semantic loading and recoverable error states", () => {
    const loading = render(<GuestsLoading />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Loading guests and RSVPs");
    loading.unmount();

    const reset = vi.fn();
    render(<GuestsError error={new Error("Unavailable")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("alert").textContent).toContain("Guests and RSVPs could not be loaded");
    expect(reset).toHaveBeenCalledOnce();
  });
});
