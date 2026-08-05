import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardError from "../app/dashboard/error";
import DashboardLoading from "../app/dashboard/loading";
import { CreatorShell } from "../src/components/dashboard/CreatorShell";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/dashboard/invitations/71000000-0000-4000-8000-000000000001",
}));

vi.mock("../src/server/auth/actions", () => ({
  signOut: vi.fn(() => new Promise(() => undefined)),
}));

// jsdom ships no `matchMedia`. The shell's pull-to-refresh asks it for the mobile
// breakpoint on mount; these tests are about the chrome, so it answers desktop.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

afterEach(cleanup);

describe("creator workspace shell", () => {
  it("keeps desktop and mobile navigation around the route content", () => {
    render(
      <CreatorShell email="maria@example.com" metadata={{ full_name: "Maria Santos" }}>
        <h1>Invitation editor</h1>
      </CreatorShell>,
    );

    const desktopNavigation = screen.getByRole("navigation", { name: "Creator workspace" });
    const invitationsLink = within(desktopNavigation).getByRole("link", {
      name: "Invitations",
    });
    expect(invitationsLink.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("navigation", { name: "Mobile creator workspace" })).toBeDefined();
    expect(screen.getByRole("main").textContent).toContain("Invitation editor");
    expect(screen.getAllByRole("link", { name: "Invitica home" })).toHaveLength(2);
  });

  it("does not navigate when the destination you are on is activated again", () => {
    render(
      <CreatorShell email="maria@example.com" metadata={{ full_name: "Maria Santos" }}>
        <h1>Invitation editor</h1>
      </CreatorShell>,
    );
    const desktopNavigation = screen.getByRole("navigation", { name: "Creator workspace" });

    // `fireEvent` returns false when the handler called preventDefault.
    const currentPage = within(desktopNavigation).getByRole("link", { name: "Invitations" });
    expect(fireEvent.click(currentPage)).toBe(false);
    // The link keeps its href, so opening it in a new tab still works.
    expect(currentPage.getAttribute("href")).toBe("/dashboard/invitations");

    const otherPage = within(desktopNavigation).getByRole("link", { name: "Templates" });
    expect(fireEvent.click(otherPage)).toBe(true);
  });

  it("restores focus after the profile menu closes", () => {
    render(
      <CreatorShell email="maria@example.com" metadata={{ full_name: "Maria Santos" }}>
        <h1>Invitation editor</h1>
      </CreatorShell>,
    );
    const profileTrigger = screen.getAllByRole("button", {
      name: "Open profile menu for Maria",
    })[0];
    if (!profileTrigger) throw new Error("Expected the desktop profile trigger.");

    fireEvent.click(profileTrigger);
    expect(screen.getByRole("button", { name: "Settings Coming soon" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(document.activeElement).toBe(profileTrigger);
  });

  it("prevents repeated sign-out submissions and names the pending action", async () => {
    render(
      <CreatorShell email="maria@example.com" metadata={{ full_name: "Maria Santos" }}>
        <h1>Invitation editor</h1>
      </CreatorShell>,
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Open profile menu for Maria" })[0] as HTMLElement,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Signing out…" })).toHaveProperty("disabled", true),
    );
  });

  it("provides labelled overview loading and retry states inside the persistent shell", () => {
    const reset = vi.fn();
    const view = render(<DashboardLoading />);

    expect(screen.getByRole("status", { name: "Loading overview" })).toBeDefined();
    view.rerender(<DashboardError error={new Error("Unavailable")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "The creator workspace could not be loaded",
    );
    expect(reset).toHaveBeenCalledOnce();
  });
});
