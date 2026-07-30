import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InvitationsError from "../app/dashboard/invitations/error";
import InvitationsLoading from "../app/dashboard/invitations/loading";
import InvitationsPage from "../app/dashboard/invitations/page";
import { ensurePersonalWorkspace } from "../src/server/auth/session";
import { listInvitationDrafts } from "../src/server/invitations/drafts";
import { listInvitationPublicationStatuses } from "../src/server/invitations/publications";

vi.mock("../src/server/auth/actions", () => ({
  signOut: vi.fn(),
}));

vi.mock("../src/components/invitations/InvitationDeleteButton", () => ({
  InvitationDeleteButton: () => <button type="button">Delete</button>,
}));

vi.mock("../src/server/auth/session", () => ({
  ensurePersonalWorkspace: vi.fn(),
}));

vi.mock("../src/server/invitations/drafts", () => ({
  listInvitationDrafts: vi.fn(),
}));

vi.mock("../src/server/invitations/publications", () => ({
  listInvitationPublicationStatuses: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(ensurePersonalWorkspace).mockReset();
  vi.mocked(listInvitationDrafts).mockReset();
  vi.mocked(listInvitationDrafts).mockResolvedValue([]);
  vi.mocked(listInvitationPublicationStatuses).mockReset();
  vi.mocked(listInvitationPublicationStatuses).mockResolvedValue({});
});

function imageSource(image: HTMLImageElement) {
  return image.src.includes("/_next/image")
    ? new URL(image.src).searchParams.get("url")
    : image.getAttribute("src");
}

describe("invitations page", () => {
  it("renders the dedicated invitation library empty state", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: "72000000-0000-4000-8000-000000000001",
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
  });

  it("lists saved drafts with direct links back to their editors", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: "72000000-0000-4000-8000-000000000001",
    });
    vi.mocked(listInvitationDrafts).mockResolvedValue([
      {
        dateLabel: "December 20, 2026",
        invitationId: "71000000-0000-4000-8000-000000000001",
        manifest: {
          listing: {
            id: "garden-promise",
            name: "Garden Promise",
            occasion: "Wedding",
          },
        },
        revision: 2,
        templateVersionId: "40000000-0000-4000-8000-000000000001",
        title: "Mara & Joaquin",
        updatedAt: "2026-07-19T04:00:00+00:00",
      },
    ] as never);

    render(await InvitationsPage());

    expect(screen.getByText("1 saved invitation")).toBeDefined();
    expect(screen.getByText("Draft")).toBeDefined();
    expect(screen.getByRole("heading", { level: 3, name: "Mara & Joaquin" })).toBeDefined();
    const artwork = screen.getByRole("img", { name: "Garden Promise design preview" });
    const image = artwork.querySelector<HTMLImageElement>("img");
    expect(image?.getAttribute("alt")).toBe("");
    if (!image) throw new Error("Missing Garden Promise still");
    expect(imageSource(image)).toBe("/landing/templates/garden-promise.jpg");
    expect(screen.queryByText("Your first invitation begins here.")).toBeNull();
    expect(screen.getByRole("link", { name: "Continue editing" }).getAttribute("href")).toBe(
      "/dashboard/invitations/71000000-0000-4000-8000-000000000001",
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();
  });

  it("uses the Little Blessings still instead of neutral fallback artwork", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: {} as never,
      user: { email: "maria@example.com", user_metadata: {} } as never,
      workspaceId: "72000000-0000-4000-8000-000000000001",
    });
    vi.mocked(listInvitationDrafts).mockResolvedValue([
      {
        dateLabel: "April 11, 2027",
        invitationId: "71000000-0000-4000-8000-000000000002",
        manifest: {
          listing: {
            id: "little-blessings",
            name: "Little Blessings",
            occasion: "Christening",
          },
        },
        revision: 3,
        templateVersionId: "40000000-0000-4000-8000-000000000002",
        title: "Eliana's Christening",
        updatedAt: "2026-07-29T04:00:00+00:00",
      },
    ] as never);

    render(await InvitationsPage());

    const artwork = screen.getByRole("img", { name: "Little Blessings design preview" });
    const image = artwork.querySelector<HTMLImageElement>("img");
    if (!image) throw new Error("Missing Little Blessings still");
    expect(imageSource(image)).toBe("/landing/templates/little-blessings.jpg");
    expect(screen.getByText("Little Blessings design")).toBeDefined();
  });

  it("labels a delivered current revision as published", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: {} as never,
      user: { email: "maria@example.com", user_metadata: {} } as never,
      workspaceId: "72000000-0000-4000-8000-000000000001",
    });
    vi.mocked(listInvitationDrafts).mockResolvedValue([
      {
        dateLabel: null,
        invitationId: "71000000-0000-4000-8000-000000000001",
        manifest: {
          listing: { id: "garden-promise", name: "Garden Promise", occasion: "Wedding" },
        },
        revision: 4,
        templateVersionId: "40000000-0000-4000-8000-000000000001",
        title: "Mara & Joaquin",
        updatedAt: "2026-07-19T04:00:00+00:00",
      },
    ] as never);
    vi.mocked(listInvitationPublicationStatuses).mockResolvedValue({
      "71000000-0000-4000-8000-000000000001": {
        errorCode: null,
        livePublicIdentifier: "0123456789abcdef0123456789abcdef",
        publicationId: "92000000-0000-4000-8000-000000000001",
        publishedRevision: 4,
        status: "delivered",
      },
    });

    render(await InvitationsPage());

    expect(screen.getByText("Published")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
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
