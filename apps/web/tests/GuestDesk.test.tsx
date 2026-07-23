import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuestDesk } from "../src/components/guests/GuestDesk";
import {
  copyGuestInvitationAction,
  createGuestPartiesAction,
  replaceGuestPartyLinkAction,
  restoreGuestPartyAction,
  trashGuestPartyAction,
  updateGuestPartyAction,
} from "../src/server/guests/actions";
import type { GuestPartySummary } from "../src/server/guests/guests";

const push = vi.fn();
const refresh = vi.fn();
const writeText = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../src/server/guests/actions", () => ({
  copyGuestInvitationAction: vi.fn(),
  createGuestPartiesAction: vi.fn(),
  replaceGuestPartyLinkAction: vi.fn(),
  restoreGuestPartyAction: vi.fn(),
  revokeGuestPartyLinkAction: vi.fn(),
  trashGuestPartyAction: vi.fn(),
  updateGuestPartyAction: vi.fn(),
}));

const invitation = {
  genericUrl: `http://localhost:3000/i/mara-and-joaquin-${"a".repeat(32)}`,
  invitationId: "72000000-0000-4000-8000-000000000001",
  publicIdentifier: "a".repeat(32),
  title: "Mara & Joaquin",
};
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

function party(overrides: Partial<GuestPartySummary> = {}): GuestPartySummary {
  return {
    archivedAt: null,
    capacity: 2,
    createdAt: "2026-07-22T08:00:00+08:00",
    guestMembers: [{ id: "74000000-0000-4000-8000-000000000001", name: "Lena Santos" }],
    id: "73000000-0000-4000-8000-000000000001",
    internalLabel: "Santos household",
    linkStatus: "active",
    recipientName: "Tita Lena and family",
    response: null,
    revision: 1,
    ...overrides,
  };
}

function renderDesk(
  parties: readonly GuestPartySummary[] = [],
  trashedParties: readonly GuestPartySummary[] = [],
) {
  return render(
    <GuestDesk
      invitations={[invitation]}
      parties={parties}
      resultSummary={{
        ...resultSummary,
        awaitingParties: parties.length,
        guestPartyCount: parties.length,
      }}
      selectedInvitation={invitation}
      trashedParties={trashedParties}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  writeText.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("GuestDesk", () => {
  it("creates multiple parties in one keyboard-friendly composer", async () => {
    vi.mocked(createGuestPartiesAction).mockResolvedValue({ count: 2, status: "created" });
    renderDesk();

    fireEvent.click(screen.getByRole("button", { name: "Add guests" }));
    const firstName = screen.getByLabelText("Guest or party name");
    fireEvent.change(firstName, {
      target: { value: "John Cruz" },
    });
    fireEvent.keyDown(firstName, { key: "Enter" });
    const names = screen.getAllByLabelText("Guest or party name");
    fireEvent.change(names[1] as HTMLElement, { target: { value: "Santos family" } });
    const seats = screen.getAllByLabelText("Seats");
    fireEvent.change(seats[1] as HTMLElement, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Create 2 parties" }));

    await waitFor(() => expect(createGuestPartiesAction).toHaveBeenCalledOnce());
    expect(createGuestPartiesAction).toHaveBeenCalledWith({
      invitationId: invitation.invitationId,
      mutationId: expect.any(String),
      parties: [
        { capacity: 1, guestNames: [], internalLabel: "John Cruz", recipientName: "John Cruz" },
        {
          capacity: 4,
          guestNames: [],
          internalLabel: "Santos family",
          recipientName: "Santos family",
        },
      ],
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("copies a complete general invitation without promising RSVP", async () => {
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Copy general invitation" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain("You're invited to Mara & Joaquin.");
    expect(copied).toContain(invitation.genericUrl);
    expect(copied).not.toContain("RSVP");
  });

  it("copies the recoverable party invitation from its own row", async () => {
    const copyText = `Hi Tita Lena!\n${invitation.genericUrl}#g=${"A".repeat(43)}`;
    vi.mocked(copyGuestInvitationAction).mockResolvedValue({
      copyText,
      personalizedUrl: `${invitation.genericUrl}#g=${"A".repeat(43)}`,
      status: "ready",
    });
    renderDesk([party()]);

    fireEvent.click(screen.getByRole("button", { name: "Copy invitation for Santos household" }));
    await waitFor(() => expect(copyGuestInvitationAction).toHaveBeenCalledOnce());
    expect(writeText).toHaveBeenCalledWith(copyText);
    expect(
      screen.getByRole("button", { name: "Copied invitation for Santos household" }),
    ).toBeDefined();
  });

  it("groups RSVP details into a readable party ledger", () => {
    renderDesk([
      party({
        capacity: 3,
        response: {
          attendance: "attending",
          attendeeCount: 2,
          message: "We are delighted to celebrate with you.",
          updatedAt: "2026-07-23T04:00:00+00:00",
        },
      }),
    ]);

    const ledger = screen.getByRole("table", { name: "Guest party response ledger" });
    expect(
      within(ledger)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Guest party", "RSVP", "Message", "Invitation", "Actions"]);
    expect(within(ledger).queryByRole("columnheader", { name: "Seats" })).toBeNull();
    expect(within(ledger).queryByRole("columnheader", { name: "Updated" })).toBeNull();
    expect(within(ledger).getByText("2 of 3 attending")).toBeDefined();
    expect(within(ledger).getByText("We are delighted to celebrate with you.")).toBeDefined();
    expect(within(ledger).queryByText("Read full message")).toBeNull();
  });

  it("keeps unusually long RSVP messages available through a disclosure", () => {
    const longMessage = "Salamat for including our whole family in your celebration. ".repeat(4);
    renderDesk([
      party({
        response: {
          attendance: "attending",
          attendeeCount: 2,
          message: longMessage,
          updatedAt: "2026-07-23T04:00:00+00:00",
        },
      }),
    ]);

    const disclosure = screen.getByText("Read full message").closest("details");
    expect(disclosure).not.toBeNull();
    fireEvent.click(screen.getByText("Read full message"));
    expect(disclosure?.hasAttribute("open")).toBe(true);
    expect(disclosure?.querySelector("p")?.textContent).toBe(longMessage);
  });

  it("selects the complete message when clipboard access fails", async () => {
    writeText.mockRejectedValue(new Error("Clipboard unavailable"));
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Copy general invitation" }));

    const fallback = await screen.findByRole("textbox", {
      name: "General invitation message",
    });
    await waitFor(() => expect(document.activeElement).toBe(fallback));
    expect((fallback as HTMLTextAreaElement).value).toContain(invitation.genericUrl);
  });

  it("edits the complete party while preserving link and response state", async () => {
    vi.mocked(updateGuestPartyAction).mockResolvedValue({ status: "updated" });
    renderDesk([party()]);
    fireEvent.click(screen.getByRole("button", { name: "More actions for Santos household" }));
    const editAction = screen.getByRole("button", { name: "Edit Santos household" });
    expect(editAction.closest("td")?.dataset.label).toBe("Actions");
    fireEvent.click(editAction);

    const dialog = screen.getByRole("dialog", { name: "Update Santos household" });
    expect(within(dialog).queryByRole("button", { name: /Remove Lena Santos/ })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Guest or party name"), {
      target: { value: "Santos and Reyes household" },
    });
    fireEvent.change(within(dialog).getByLabelText("Envelope greeting"), {
      target: { value: "Tita Lena, Paolo, and family" },
    });
    fireEvent.change(within(dialog).getByLabelText("Seats"), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByLabelText("Named members"), {
      target: { value: "Lena Santos\nPaolo Santos" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateGuestPartyAction).toHaveBeenCalledOnce());
    expect(updateGuestPartyAction).toHaveBeenCalledWith({
      capacity: 3,
      expectedRevision: 1,
      guestNames: ["Lena Santos", "Paolo Santos"],
      guestPartyId: "73000000-0000-4000-8000-000000000001",
      internalLabel: "Santos and Reyes household",
      invitationId: invitation.invitationId,
      recipientName: "Tita Lena, Paolo, and family",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("offers a conventional close button on the add-guests dialog", () => {
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Add guests" }));
    fireEvent.click(screen.getByRole("button", { name: "Close add guests" }));

    expect(screen.queryByRole("dialog", { name: "Prepare one or many invitations" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add guests" }));
  });

  it("moves a party to reversible trash and restores it", async () => {
    vi.mocked(trashGuestPartyAction).mockResolvedValue({ status: "trashed" });
    vi.mocked(restoreGuestPartyAction).mockResolvedValue({ status: "restored" });
    const active = party();
    const trashed = party({ archivedAt: "2026-07-23T08:00:00+08:00", revision: 2 });
    const view = renderDesk([active]);

    fireEvent.click(screen.getByRole("button", { name: "More actions for Santos household" }));
    fireEvent.click(screen.getByRole("button", { name: "Move party to trash" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Move to trash" }),
    );
    await waitFor(() => expect(trashGuestPartyAction).toHaveBeenCalledOnce());

    view.rerender(
      <GuestDesk
        invitations={[invitation]}
        parties={[]}
        resultSummary={resultSummary}
        selectedInvitation={invitation}
        trashedParties={[trashed]}
      />,
    );
    fireEvent.click(screen.getByText("Recently deleted (1)"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restoreGuestPartyAction).toHaveBeenCalledOnce());
  });

  it("replaces an active link only after confirmation and copies the new message", async () => {
    const replacement = `${invitation.genericUrl}#g=${"B".repeat(43)}`;
    vi.mocked(replaceGuestPartyLinkAction).mockResolvedValue({
      copyText: `Ready\n${replacement}`,
      personalizedUrl: replacement,
      status: "replaced",
    });
    renderDesk([party()]);

    fireEvent.click(screen.getByRole("button", { name: "More actions for Santos household" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace private link" }));
    expect(replaceGuestPartyLinkAction).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Replace & copy" }),
    );
    await waitFor(() => expect(replaceGuestPartyLinkAction).toHaveBeenCalledOnce());
    expect(writeText).toHaveBeenCalledWith(`Ready\n${replacement}`);
  });

  it("keeps search and response filtering on the real party ledger", () => {
    renderDesk([
      party({
        response: {
          attendance: "attending",
          attendeeCount: 2,
          message: "We are delighted to celebrate.",
          updatedAt: "2026-07-23T04:00:00+00:00",
        },
      }),
      party({
        guestMembers: [],
        id: "73000000-0000-4000-8000-000000000002",
        internalLabel: "Reyes couple",
        recipientName: "Ana and Miguel",
      }),
    ]);

    fireEvent.click(screen.getByRole("combobox", { name: /Response/ }));
    fireEvent.click(screen.getByRole("option", { name: "Attending" }));
    expect(screen.getByText("Santos household")).toBeDefined();
    expect(screen.queryByText("Reyes couple")).toBeNull();
  });
});
