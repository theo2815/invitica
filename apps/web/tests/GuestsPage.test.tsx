import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GuestsError from "../app/dashboard/guests/error";
import GuestsLoading from "../app/dashboard/guests/loading";
import GuestsPage from "../app/dashboard/guests/page";
import { ensurePersonalWorkspace } from "../src/server/auth/session";
import {
  listDeliveredGuestInvitations,
  listGuestPartyPage,
  listTrashedGuestParties,
} from "../src/server/guests/guests";
import { listInvitationResultSummaries } from "../src/server/guests/results";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("../src/server/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("../src/server/auth/session", () => ({ ensurePersonalWorkspace: vi.fn() }));
vi.mock("../src/server/guests/guests", () => ({
  listDeliveredGuestInvitations: vi.fn(),
  listGuestPartyPage: vi.fn(),
  listTrashedGuestParties: vi.fn(),
}));
vi.mock("../src/server/guests/results", async () => {
  const actual = await vi.importActual<typeof import("../src/server/guests/results")>(
    "../src/server/guests/results",
  );
  return { ...actual, listInvitationResultSummaries: vi.fn() };
});
vi.mock("../src/server/guests/actions", () => ({
  copyGuestInvitationAction: vi.fn(),
  createGuestPartiesAction: vi.fn(),
  loadGuestPartyPageAction: vi.fn(),
  replaceGuestPartyLinkAction: vi.fn(),
  restoreGuestPartyAction: vi.fn(),
  revokeGuestPartyLinkAction: vi.fn(),
  trashGuestPartyAction: vi.fn(),
  updateGuestPartyAction: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listDeliveredGuestInvitations).mockResolvedValue([]);
  vi.mocked(listGuestPartyPage).mockResolvedValue({
    hasMore: false,
    nextOffset: 0,
    parties: [],
  });
  vi.mocked(listTrashedGuestParties).mockResolvedValue([]);
  vi.mocked(listInvitationResultSummaries).mockResolvedValue({});
});

const pageProps = (invitationId?: string) => ({
  searchParams: Promise.resolve(invitationId ? { invitationId } : {}),
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
      workspaceId: "71000000-0000-4000-8000-000000000001",
    });

    render(await GuestsPage(pageProps()));

    expect(screen.getByRole("heading", { level: 1, name: "Guests & RSVPs" })).toBeDefined();
    expect(screen.getByText("Choose a published invitation")).toBeDefined();
    expect(screen.getByRole("link", { name: "View invitations" }).getAttribute("href")).toBe(
      "/dashboard/invitations",
    );
    expect(screen.queryByRole("button", { name: "Add guests" })).toBeNull();
  });

  it("loads only the requested delivered invitation context", async () => {
    const invitationId = "72000000-0000-4000-8000-000000000001";
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: {} as never,
      user: { email: "maria@example.com", user_metadata: {} } as never,
      workspaceId: "71000000-0000-4000-8000-000000000001",
    });
    vi.mocked(listDeliveredGuestInvitations).mockResolvedValue([
      {
        celebrantPronoun: "they" as const,
        generalShareMessage: null,
        personalShareMessage: null,
        genericUrl: `http://localhost:3000/i/mara-and-joaquin-${"a".repeat(32)}`,
        invitationId,
        occasion: "Wedding" as const,
        publicIdentifier: "a".repeat(32),
        title: "Mara & Joaquin",
      },
    ]);
    vi.mocked(listInvitationResultSummaries).mockResolvedValue({
      [invitationId]: {
        attendingGuests: 3,
        attendingParties: 1,
        awaitingParties: 1,
        declinedParties: 0,
        guestPartyCount: 2,
        invitationId,
        lastResponseAt: "2026-07-23T04:00:00+00:00",
        lastViewedAt: "2026-07-23T05:00:00+00:00",
        reservedSeats: 5,
        viewCount: 9,
      },
    });

    render(await GuestsPage(pageProps(invitationId)));

    expect(screen.getByRole("heading", { name: "Mara & Joaquin" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Add guests" })).toBeDefined();
    expect(screen.getByText("Approximate page loads").previousElementSibling?.textContent).toBe(
      "9",
    );
    expect(listGuestPartyPage).toHaveBeenCalledWith(
      {},
      "71000000-0000-4000-8000-000000000001",
      invitationId,
      {
        offset: 0,
        query: "",
        responseFilter: "all",
      },
    );
    expect(listTrashedGuestParties).toHaveBeenCalledWith(
      {},
      "71000000-0000-4000-8000-000000000001",
      invitationId,
    );
  });

  it("shows the workspace failure instead of private guest controls", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: { message: "Migration missing" } as never,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: null,
    });

    render(await GuestsPage(pageProps()));

    expect(screen.getByRole("alert").textContent).toContain("Your workspace needs attention");
    expect(screen.queryByRole("button", { name: "Add guests" })).toBeNull();
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
