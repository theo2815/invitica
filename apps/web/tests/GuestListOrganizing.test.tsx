import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      questions: [],
      status: "parsed",
    });

    renderDesk();
    openComposer();

    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2, Kuya Jun & Ate Mae" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize with Invi" }));

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
      questions: [],
      status: "parsed",
    });
    vi.mocked(createGuestPartiesAction).mockResolvedValue({ count: 2, status: "created" });

    renderDesk();
    openComposer();

    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize with Invi" }));
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

  it("sends rows already typed to Invi and lays out the whole list it answers with", async () => {
    // Changed 2026-08-07. This used to append, because Invi could not see the screen and its
    // answer only ever described the newest paste. It now receives the current rows and
    // answers with the whole list, so appending would double every row it was given.
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: [{ ...(parsed[0] as (typeof parsed)[number]) }, ...parsed.slice(1)],
      questions: [],
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
    fireEvent.change(screen.getByLabelText(/Tell Invi what to change/), {
      target: { value: "Tita Baby +2, Kuya Jun & Ate Mae" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to Invi" }));

    await waitFor(() => expect(requestGuestParties).toHaveBeenCalledTimes(1));

    // The typed row went with the request, as Invitica's own record rather than as prose.
    const sent = vi.mocked(requestGuestParties).mock.calls[0]?.[1] ?? [];
    const record = sent.find((entry) => entry.content.startsWith("[Invitica —"));
    expect(record?.role).toBe("assistant");
    expect(record?.content).toContain("Lola Remedios");
    // The creator's own message stays last, which the request contract requires.
    expect(sent.at(-1)).toEqual({
      content: "Tita Baby +2, Kuya Jun & Ate Mae",
      role: "user",
    });

    await waitFor(() => expect(partyNameFields()).toEqual(["Tita Baby", "Kuya Jun & Ate Mae"]));
  });

  it("says so when a follow-up changed how many rows there are", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      questions: [],
      status: "parsed",
    });

    renderDesk();
    openComposer();

    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2, Kuya Jun & Ate Mae" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize with Invi" }));
    await waitFor(() => expect(partyNameFields()).toHaveLength(2));

    // A second turn that comes back one row short. Nothing has been created, and the count is
    // stated both ways so a wrong answer is visible immediately rather than on submit.
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: [parsed[0] as (typeof parsed)[number]],
      questions: [],
      status: "parsed",
    });

    fireEvent.change(screen.getByLabelText(/Tell Invi what to change/), {
      target: { value: "Take Kuya Jun and Ate Mae off the list" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to Invi" }));

    // Beside the box it was typed into. The dialog's other status region belongs to the form
    // and its Create button, which is a screen away on a phone.
    await waitFor(() => expect(screen.getByText(/now 1 row, from 2/)).toBeTruthy());
    expect(partyNameFields()).toEqual(["Tita Baby"]);
    expect(createGuestPartiesAction).not.toHaveBeenCalled();
  });

  it("asks rather than guessing, and leaves every row alone while it does", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      questions: [],
      status: "parsed",
    });

    renderDesk();
    openComposer();

    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2, Kuya Jun & Ate Mae" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize with Invi" }));
    await waitFor(() => expect(partyNameFields()).toHaveLength(2));

    vi.mocked(requestGuestParties).mockResolvedValue({
      questions: ["Who are your ninongs, by name?", "Does each one get their own invitation?"],
      status: "questions",
    });

    fireEvent.change(screen.getByLabelText(/Tell Invi what to change/), {
      target: { value: "Add my ninongs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to Invi" }));

    await waitFor(() => expect(screen.getByText(/Who are your ninongs, by name\?/)).toBeTruthy());
    // A question is not a reason to take away work already done.
    expect(partyNameFields()).toEqual(["Tita Baby", "Kuya Jun & Ate Mae"]);
    expect(createGuestPartiesAction).not.toHaveBeenCalled();
  });

  it("reports a refusal and leaves the rows alone", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      message: "You have used all of today's messages with Invi. They refresh tomorrow.",
      status: "refused",
    });

    renderDesk();
    openComposer();

    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize with Invi" }));

    await waitFor(() => expect(screen.getByText(/today's messages/)).toBeTruthy());
    expect(partyNameFields()).toEqual([""]);
    expect(createGuestPartiesAction).not.toHaveBeenCalled();

    // Try again hands the paste back rather than leaving the creator's own words nowhere.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect((screen.getByLabelText(/Paste a messy list/) as HTMLTextAreaElement).value).toBe(
      "Tita Baby +2",
    );
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
    expect(focusable).toContain(screen.getByRole("button", { name: "Organize with Invi" }));
  });

  it("is not offered at all when the assistant is switched off", () => {
    renderDesk({ assistantAvailable: false });
    openComposer();

    expect(screen.queryByLabelText(/Paste a messy list/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Organize with Invi" })).toBeNull();
    // The manual and spreadsheet-paste paths are untouched by the flag.
    expect(screen.getAllByRole("textbox", { name: "Guest or party name" })).toHaveLength(1);
  });

  it("marks only the rows a follow-up actually changed", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      questions: [],
      status: "parsed",
    });

    renderDesk();
    openComposer();

    fireEvent.change(screen.getByLabelText(/Paste a messy list/), {
      target: { value: "Tita Baby +2, Kuya Jun & Ate Mae" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize with Invi" }));
    await waitFor(() => expect(partyNameFields()).toHaveLength(2));

    // One seat count moves. The other row comes back exactly as it went.
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: [
        { ...(parsed[0] as (typeof parsed)[number]), capacity: 4 },
        parsed[1] as (typeof parsed)[number],
      ],
      questions: [],
      status: "parsed",
    });

    fireEvent.change(screen.getByLabelText(/Tell Invi what to change/), {
      target: { value: "Tita Baby is 4, not 3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to Invi" }));

    await waitFor(() => {
      const marked = screen
        .getByRole("dialog")
        .querySelectorAll('fieldset[data-arrived="true"] input[value="Tita Baby"]');
      expect(marked).toHaveLength(1);
    });
    // The untouched row is not marked, so the edit is findable in a list of forty.
    expect(
      screen.getByRole("dialog").querySelectorAll('fieldset[data-arrived="true"]'),
    ).toHaveLength(1);
  });

  it("offers examples that fill the box rather than spending a message", () => {
    renderDesk();
    openComposer();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Tita Baby +2, Kuya Jun & Ate Mae, Santos family (5), Ninong Ramon",
      }),
    );

    expect(requestGuestParties).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Paste a messy list/) as HTMLTextAreaElement).value).toBe(
      "Tita Baby +2, Kuya Jun & Ate Mae, Santos family (5), Ninong Ramon",
    );
  });

  it("sends on Enter and breaks the line on Shift+Enter", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      questions: [],
      status: "parsed",
    });

    renderDesk();
    openComposer();

    const box = screen.getByLabelText(/Paste a messy list/);
    fireEvent.change(box, { target: { value: "Tita Baby +2" } });

    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(requestGuestParties).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(requestGuestParties).toHaveBeenCalledTimes(1));
  });
});

describe("the Add guests composer's own controls", () => {
  it("does not offer to create parties from an untouched row", () => {
    renderDesk();
    openComposer();

    // It used to read "Create 1 party" beside one blank row, and then refuse it on validation.
    const create = screen.getByRole("button", { name: "Create parties" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);

    fireEvent.change(
      screen.getAllByRole("textbox", { name: "Guest or party name" })[0] as Element,
      { target: { value: "Lola Remedios" } },
    );

    expect(screen.getByRole("button", { name: "Create 1 party" })).toBeTruthy();
  });

  it("ignores a blank trailing row rather than failing validation on it", async () => {
    vi.mocked(createGuestPartiesAction).mockResolvedValue({ count: 1, status: "created" });

    renderDesk();
    openComposer();

    fireEvent.change(
      screen.getAllByRole("textbox", { name: "Guest or party name" })[0] as Element,
      { target: { value: "Lola Remedios" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));

    // Two rows on screen, one of them the composer's own placeholder.
    expect(screen.getAllByRole("textbox", { name: "Guest or party name" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Create 1 party" }));

    await waitFor(() => expect(createGuestPartiesAction).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(createGuestPartiesAction).mock.calls[0]?.[0] as {
      parties: { internalLabel: string }[];
    };
    expect(sent.parties.map((party) => party.internalLabel)).toEqual(["Lola Remedios"]);
  });
});

describe("closing the Add guests composer with work in it", () => {
  it("closes straight away when nothing has been typed", () => {
    renderDesk();
    openComposer();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("heading", { name: "Discard these guest rows?" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close add guests" })).toBeNull();
  });

  it("asks before discarding typed rows, and keeps them when the creator says so", () => {
    renderDesk();
    openComposer();

    fireEvent.change(
      screen.getAllByRole("textbox", { name: "Guest or party name" })[0] as Element,
      { target: { value: "Lola Remedios" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Close add guests" }));

    expect(screen.getByRole("heading", { name: "Discard these guest rows?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("heading", { name: "Discard these guest rows?" })).toBeNull();
    expect(partyNameFields()).toEqual(["Lola Remedios"]);
    expect(screen.getByRole("button", { name: "Close add guests" })).toBeTruthy();
  });

  it("asks about rows Invi handed over, which were never typed at all", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      questions: [],
      status: "parsed",
    });

    renderDesk({ withWidget: true });

    fireEvent.click(screen.getByRole("button", { name: "Ask Invi, Invitica's AI assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Organize my guest list" }));
    fireEvent.change(screen.getByLabelText("Paste your guest list"), {
      target: { value: "Tita Baby +2, Kuya Jun & Ate Mae" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "2 invitations, not created yet" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review in Guest Desk" }));
    await waitFor(() => expect(partyNameFields()).toHaveLength(2));

    // Nothing here was typed, and a stray Escape used to discard a parsed list already paid for.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Discard these guest rows?" })).toBeTruthy();
    expect(partyNameFields()).toEqual(["Tita Baby", "Kuya Jun & Ate Mae"]);
  });

  it("treats Escape inside the question as Keep editing, never as Discard", () => {
    renderDesk();
    openComposer();

    fireEvent.change(
      screen.getAllByRole("textbox", { name: "Guest or party name" })[0] as Element,
      { target: { value: "Lola Remedios" } },
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Discard these guest rows?" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Discard these guest rows?" })).toBeNull();
    expect(partyNameFields()).toEqual(["Lola Remedios"]);
    expect(screen.getByRole("button", { name: "Close add guests" })).toBeTruthy();
  });

  it("discards only when the creator chooses it explicitly", () => {
    renderDesk();
    openComposer();

    fireEvent.change(
      screen.getAllByRole("textbox", { name: "Guest or party name" })[0] as Element,
      { target: { value: "Lola Remedios" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.queryByRole("button", { name: "Close add guests" })).toBeNull();
    expect(createGuestPartiesAction).not.toHaveBeenCalled();
  });
});

describe("organizing a guest list from the Invi panel", () => {
  it("hands the parsed rows to the composer, where the creator confirms them", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      questions: [],
      status: "parsed",
    });

    renderDesk({ withWidget: true });

    fireEvent.click(screen.getByRole("button", { name: "Ask Invi, Invitica's AI assistant" }));
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
      questions: [],
      status: "parsed",
    });

    renderDesk({ withWidget: true });

    fireEvent.click(screen.getByRole("button", { name: "Ask Invi, Invitica's AI assistant" }));
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
    // Four now, not three: Invitica's record of the rows on screen rides between the count
    // sentence and the correction. Without it "Tita Baby is 4" was answered by re-deriving the
    // whole list from the first paste, so a positional reference was guesswork.
    expect(thread.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "assistant",
      "user",
    ]);
    expect(thread[2]?.content).toContain(
      "[Invitica — the rows currently on this creator's screen]",
    );
    expect(thread[2]?.content).toContain("Tita Baby");
    expect(thread.at(-1)?.content).toBe("Tita Baby is 4, not 3");
  });

  it("keeps the rows on screen when Invi asks a question instead", async () => {
    vi.mocked(requestGuestParties).mockResolvedValue({
      invitationId: invitation.invitationId,
      parties: parsed,
      questions: [],
      status: "parsed",
    });

    renderDesk({ withWidget: true });

    fireEvent.click(screen.getByRole("button", { name: "Ask Invi, Invitica's AI assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Organize my guest list" }));

    fireEvent.change(screen.getByLabelText("Paste your guest list"), {
      target: { value: "Tita Baby +2, Kuya Jun & Ate Mae" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "2 invitations, not created yet" })).toBeTruthy(),
    );

    vi.mocked(requestGuestParties).mockResolvedValue({
      questions: ["Who are your ninongs, by name?"],
      status: "questions",
    });

    fireEvent.change(screen.getByLabelText("Paste your guest list"), {
      target: { value: "Add my ninongs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organize" }));

    await waitFor(() => expect(screen.getByText(/Who are your ninongs, by name\?/)).toBeTruthy());
    // The list already found stays listed. A question takes nothing away.
    expect(screen.getByRole("heading", { name: "2 invitations, not created yet" })).toBeTruthy();
  });
});
