import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "../app/dashboard/page";
import { ensurePersonalWorkspace } from "../src/server/auth/session";
import { listInvitationResultSummaries } from "../src/server/guests/results";
import { listInvitationDrafts } from "../src/server/invitations/drafts";
import { listInvitationPublicationStatuses } from "../src/server/invitations/publications";

vi.mock("../src/server/auth/actions", () => ({
  signOut: vi.fn(),
}));

vi.mock("../src/server/auth/session", () => ({
  ensurePersonalWorkspace: vi.fn(),
}));
vi.mock("../src/server/guests/results", async () => {
  const actual = await vi.importActual<typeof import("../src/server/guests/results")>(
    "../src/server/guests/results",
  );
  return { ...actual, listInvitationResultSummaries: vi.fn() };
});
vi.mock("../src/server/invitations/drafts", () => ({ listInvitationDrafts: vi.fn() }));
vi.mock("../src/server/invitations/publications", () => ({
  listInvitationPublicationStatuses: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listInvitationDrafts).mockResolvedValue([]);
  vi.mocked(listInvitationPublicationStatuses).mockResolvedValue({});
  vi.mocked(listInvitationResultSummaries).mockResolvedValue({});
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

    expect(screen.getByRole("heading", { level: 1, name: "Welcome back, Maria." })).toBeDefined();
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
    expect(screen.getAllByText("Maria")).toHaveLength(2);
    const profileTrigger = screen.getAllByRole("button", {
      name: "Open profile menu for Maria",
    })[0];
    if (!profileTrigger) {
      throw new Error("Expected a profile menu trigger.");
    }
    fireEvent.click(profileTrigger);
    expect(screen.getByRole("button", { name: "Settings Coming soon" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(document.activeElement).toBe(profileTrigger);
    expect(screen.getAllByText("maria@example.com").length).toBeGreaterThanOrEqual(2);
  });

  it("connects real publication and guest results to the creator overview", async () => {
    const invitationId = "71000000-0000-4000-8000-000000000001";
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: {} as never,
      user: { email: "maria@example.com", user_metadata: {} } as never,
      workspaceId: "72000000-0000-4000-8000-000000000001",
    });
    vi.mocked(listInvitationDrafts).mockResolvedValue([
      {
        dateLabel: "December 20, 2026",
        invitationId,
        manifest: {
          listing: { id: "garden-promise", name: "Garden Promise", occasion: "Wedding" },
        },
        revision: 4,
        templateVersionId: "40000000-0000-4000-8000-000000000001",
        title: "Mara & Joaquin",
        updatedAt: "2026-07-23T04:00:00+00:00",
      },
    ] as never);
    vi.mocked(listInvitationPublicationStatuses).mockResolvedValue({
      [invitationId]: {
        errorCode: null,
        livePublicIdentifier: "a".repeat(32),
        publicationId: "73000000-0000-4000-8000-000000000001",
        publishedRevision: 4,
        status: "delivered",
      },
    });
    vi.mocked(listInvitationResultSummaries).mockResolvedValue({
      [invitationId]: {
        attendingGuests: 3,
        attendingParties: 1,
        awaitingParties: 2,
        declinedParties: 1,
        guestPartyCount: 4,
        invitationId,
        lastResponseAt: "2026-07-23T04:00:00+00:00",
        lastViewedAt: "2026-07-23T05:00:00+00:00",
        reservedSeats: 8,
        viewCount: 12,
      },
    });

    render(await DashboardPage());

    expect(screen.getByRole("heading", { name: "Mara & Joaquin" })).toBeDefined();
    expect(screen.getByText("Published")).toBeDefined();
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("link", { name: "Guests & RSVPs" })
        .some((link) => link.getAttribute("href")?.includes(invitationId)),
    ).toBe(true);
    expect(screen.queryByText("Create something worth opening.")).toBeNull();
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
