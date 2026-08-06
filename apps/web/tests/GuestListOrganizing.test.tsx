import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantProvider } from "../src/components/assistant/AssistantProvider";
import { AssistantWidget } from "../src/components/assistant/AssistantWidget";
import { requestGuestParties } from "../src/components/assistant/guest-parsing";
import { GuestDesk } from "../src/components/guests/GuestDesk";
import { fetchGuestPartyPage } from "../src/components/guests/guest-desk-api";
import { createGuestPartiesAction } from "../src/server/guests/actions";
import type { GuestInvitationSummary } from "../src/server/guests/guests";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/guests",
  useRouter: () => ({ push, refresh }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../src/server/guests/actions", () => ({
  copyGuestInvitationAction: vi.fn(),
  createGuestPartiesAction: vi.fn(),
  replaceGuestPartyLinkAction: vi.fn(),
  restoreGuestPartyAction: vi.fn(),
  revokeGuestPartyLinkAction: vi.fn(),
  saveInvitationShareMessagesAction: vi.fn(),
  setGuestInvitationSentAction: vi.fn(),
  trashGuestPartyAction: vi.fn(),
  updateGuestPartyAction: vi.fn(),
}));
vi.mock("../src/components/guests/guest-desk-api", () => ({
  fetchGuestPartyPage: vi.fn(),
  fetchPreparedGuestInvitationCopies: vi.fn(),
  recordGuestInvitationCopy: vi.fn(),
}));
vi.mock("../src/components/assistant/guest-parsing", () => ({ requestGuestParties: vi.fn() }));

/** Invented. No fixture in this repository carries a real guest's name. */
const invitation: GuestInvitationSummary = {
  celebrantPronoun: "they",
  generalShareMessage: null,
  genericUrl: `http://localhost:3000/i/mara-and-joaquin-${"a".repeat(32)}`,
  invitationId: "72000000-0000-4000-8000-000000000001",
  occasion: "Wedding",
  personalShareMessage: null,
  publicIdentifier: "a".repeat(32),
  title: "Mara & Joaquin",
};

const parsed = [
  { capacity: 3, guestNames: [], internalLabel: "Tita Baby", recipientName: "Tita Baby" },
  {
    capacity: 2,
    guestNames: ["Kuya Jun", "Ate Mae"],
    internalLabel: "Kuya Jun & Ate Mae",
    recipientName: "Jun and Mae",
  },
];

const resultSummary = {
  attendingGuests: 0,
  attendingParties: 0,
  awaitingParties: 0,
  declinedParties: 0,
  guestPartyCount: 0,
  invitationId: invitation.invitationId,
  lastResponseAt: null,
  lastViewedAt: null,
  reservedSeats: 0,
  viewCount: 0,
};

/** jsdom ships no `matchMedia`. The widget asks for one breakpoint. */
function setViewport(compact: boolean) {
  window.matchMedia = ((query: string) => ({
    addEventListener: () => undefined,
    addListener: () => undefined,
    dispatchEvent: () => false,
    matches: compact,
    media: query,
    onchange: null,
    removeEventListener: () => undefined,
    removeListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function renderDesk({ assistantAvailable = true, withWidget = false } = {}) {
  return render(
    <AssistantProvider>
      <GuestDesk
        assistantAvailable={assistantAvailable}
        hasMoreParties={false}
        invitations={[invitation]}
        nextPartyOffset={0}
        parties={[]}
        resultSummary={resultSummary}
        selectedInvitation={invitation}
        trashedParties={[]}
      />
      {withWidget ? <AssistantWidget /> : null}
    </AssistantProvider>,
  );
}

function openComposer() {
  fireEvent.click(screen.getByRole("button", { name: "Add guests" }));
}

function partyNameFields() {
  return screen
    .getAllByRole("textbox", { name: "Guest or party name" })
    .map((field) => (field as HTMLInputElement).value);
}

beforeEach(() => {
  vi.clearAllMocks();
  setViewport(false);
  vi.mocked(fetchGuestPartyPage).mockResolvedValue({
    page: { hasMore: false, nextOffset: 0, parties: [] },
    status: "ready",
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("organizing a pasted guest list in the Add guests composer", () => {
  it("turns a messy paste into editable rows without creating anything", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      status: "parsed",
    });

    renderDesk();
    openComposer();

    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2, Kuya Jun & Ate Mae" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize with Tala" }));

    await waitFor(() => expect(partyNameFields()).toEqual(["Tita Baby", "Kuya Jun & Ate Mae"]));

    // The rows are the review table, and the creator's own Create button is still the only
    // thing that writes. Nothing has been created at this point.
    expect(createGuestPartiesAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create 2 parties" })).toBeTruthy();

    // Every parsed row is editable and removable, exactly like a typed one.
    expect(screen.getAllByRole("button", { name: /^Remove guest party/ })).toHaveLength(2);
    const seats = screen.getAllByRole("spinbutton", { name: "Seats" }) as HTMLInputElement[];
    expect(seats.map((field) => field.value)).toEqual(["3", "2"]);
  });

  it("creates the rows only once the creator confirms them", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      status: "parsed",
    });
    vi.mocked(createGuestPartiesAction).mockResolvedValue({ count: 2, status: "created" });

    renderDesk();
    openComposer();

    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize with Tala" }));
    await waitFor(() => expect(partyNameFields()).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Create 2 parties" }));

    await waitFor(() => expect(createGuestPartiesAction).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(createGuestPartiesAction).mock.calls[0]?.[0] as {
      parties: { capacity: number; guestNames: string[]; recipientName: string }[];
    };
    expect(sent.parties).toHaveLength(2);
    expect(sent.parties[1]?.recipientName).toBe("Jun and Mae");
    expect(sent.parties[1]?.guestNames).toEqual(["Kuya Jun", "Ate Mae"]);
  });

  it("appends to rows already typed rather than replacing them", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: [parsed[0] as (typeof parsed)[number]],
      status: "parsed",
    });

    renderDesk();
    openComposer();

    fireEvent.change(
      screen.getAllByRole("textbox", { name: "Guest or party name" })[0] as Element,
      {
        target: { value: "Lola Remedios" },
      },
    );
    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize with Tala" }));

    await waitFor(() => expect(partyNameFields()).toEqual(["Lola Remedios", "Tita Baby"]));
  });

  it("reports a refusal and leaves the rows alone", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      message: "You have used all of today's messages with Tala. They refresh tomorrow.",
      status: "refused",
    });

    renderDesk();
    openComposer();

    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize with Tala" }));

    // Scoped to the dialog: the desk behind it owns a status region of its own.
    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain(
        "today's messages",
      ),
    );
    expect(partyNameFields()).toEqual([""]);
    expect(createGuestPartiesAction).not.toHaveBeenCalled();
  });

  it("puts both of its controls inside the dialog's own focus trap", () => {
    renderDesk();
    openComposer();

    // With something to organize: the action is deliberately disabled on an empty box, and a
    // disabled control belongs outside the trap.
    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2" },
    });

    // The trap walks this exact selector, so being matched by it is what makes the paste
    // area keyboard-reachable rather than a mouse-only shortcut past the rows.
    const focusable = Array.from(
      screen
        .getByRole("dialog")
        .querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled])",
        ),
    );

    expect(focusable).toContain(screen.getByLabelText(/Paste a messy list/));
    expect(focusable).toContain(screen.getByRole("button", { name: "Organize with Tala" }));
  });

  it("is not offered at all when the assistant is switched off", () => {
    renderDesk({ assistantAvailable: false });
    openComposer();

    expect(screen.queryByLabelText(/Paste a messy list/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Organize with Tala" })).toBeNull();
    // The manual and spreadsheet-paste paths are untouched by the flag.
    expect(screen.getAllByRole("textbox", { name: "Guest or party name" })).toHaveLength(1);
  });
});

describe("organizing a guest list from the Tala panel", () => {
  it("hands the parsed rows to the composer, where the creator confirms them", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      status: "parsed",
    });

    renderDesk({ withWidget: true });

    fireEvent.click(screen.getByRole("button", { name: "Ask Tala, Invitica's AI assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Organize my guest list" }));

    fireEvent.change(screen.getByLabelText("Paste your guest list"), {
      target: { value: "Tita Baby +2, Kuya Jun & Ate Mae" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "2 invitations, not created yet" })).toBeTruthy(),
    );

    // The panel lists what was found; it is not a second editable table and creates nothing.
    expect(createGuestPartiesAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Review in Guest Desk" }));

    await waitFor(() => expect(partyNameFields()).toEqual(["Tita Baby", "Kuya Jun & Ate Mae"]));
    expect(createGuestPartiesAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create 2 parties" })).toBeTruthy();
  });

  it("sends the whole thread so a correction can be a sentence", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      status: "parsed",
    });

    renderDesk({ withWidget: true });

    fireEvent.click(screen.getByRole("button", { name: "Ask Tala, Invitica's AI assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Organize my guest list" }));

    const composer = screen.getByLabelText("Paste your guest list");
    fireEvent.change(composer, { target: { value: "Tita Baby +2" } });
    fireEvent.click(screen.getByRole("button", { name: "Organize" }));
    await waitFor(() => expect(requestGuestParties).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Paste your guest list"), {
      target: { value: "Tita Baby is 4, not 3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize" }));
    await waitFor(() => expect(requestGuestParties).toHaveBeenCalledTimes(2));

    const [, secondCall] = vi.mocked(requestGuestParties).mock.calls;
    const thread = secondCall?.[1] ?? [];
    expect(thread.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(thread.at(-1)?.content).toBe("Tita Baby is 4, not 3");
  });
});
