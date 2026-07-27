import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuestDesk } from "../src/components/guests/GuestDesk";
import {
  copyGuestInvitationAction,
  createGuestPartiesAction,
  loadGuestPartyPageAction,
  prepareGuestInvitationCopiesAction,
  recordGuestInvitationCopyAction,
  replaceGuestPartyLinkAction,
  restoreGuestPartyAction,
  saveInvitationShareMessagesAction,
  setGuestInvitationSentAction,
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
  loadGuestPartyPageAction: vi.fn(),
  prepareGuestInvitationCopiesAction: vi.fn(),
  recordGuestInvitationCopyAction: vi.fn(),
  replaceGuestPartyLinkAction: vi.fn(),
  restoreGuestPartyAction: vi.fn(),
  revokeGuestPartyLinkAction: vi.fn(),
  saveInvitationShareMessagesAction: vi.fn(),
  setGuestInvitationSentAction: vi.fn(),
  trashGuestPartyAction: vi.fn(),
  updateGuestPartyAction: vi.fn(),
}));

const invitation = {
  celebrantPronoun: "they" as const,
  generalShareMessage: null,
  personalShareMessage: null,
  genericUrl: `http://localhost:3000/i/mara-and-joaquin-${"a".repeat(32)}`,
  invitationId: "72000000-0000-4000-8000-000000000001",
  occasion: "Wedding" as const,
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
    copyCount: 0,
    createdAt: "2026-07-22T08:00:00+08:00",
    firstCopiedAt: null,
    guestMembers: [{ id: "74000000-0000-4000-8000-000000000001", name: "Lena Santos" }],
    id: "73000000-0000-4000-8000-000000000001",
    internalLabel: "Santos household",
    lastCopiedAt: null,
    linkStatus: "active",
    markedSentAt: null,
    recipientName: "Tita Lena and family",
    response: null,
    revision: 1,
    ...overrides,
  };
}

function renderDesk(
  parties: readonly GuestPartySummary[] = [],
  trashedParties: readonly GuestPartySummary[] = [],
  pagination: { hasMore: boolean; nextOffset: number } = {
    hasMore: false,
    nextOffset: parties.length,
  },
) {
  return render(
    <GuestDesk
      hasMoreParties={pagination.hasMore}
      invitations={[invitation]}
      nextPartyOffset={pagination.nextOffset}
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
  // Copies are prepared in the background on mount. Cases that assert the per-click
  // path override this with a populated result.
  vi.mocked(prepareGuestInvitationCopiesAction).mockResolvedValue({
    copies: [],
    status: "ready",
  });
  vi.mocked(loadGuestPartyPageAction).mockResolvedValue({
    page: { hasMore: false, nextOffset: 0, parties: [] },
    status: "ready",
  });
  vi.mocked(recordGuestInvitationCopyAction).mockResolvedValue({ status: "ignored" });
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
    expect(copied).toContain("Mara & Joaquin's wedding invitation with you");
    expect(copied).toContain(invitation.genericUrl);
    expect(copied).not.toContain("RSVP");
  });

  it("hands the message to the platform share sheet where one exists", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    renderDesk();

    fireEvent.click(await screen.findByRole("button", { name: "Share general invitation" }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share.mock.calls[0]?.[0].text).toContain("Mara & Joaquin's wedding invitation with you");
    // The share sheet already delivered the message; writing it to the clipboard too would
    // silently overwrite whatever the creator had copied.
    expect(writeText).not.toHaveBeenCalled();

    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "canShare");
  });

  it("keeps a copy action available beside share, for pasting somewhere the sheet does not offer", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    renderDesk([party()]);

    // Both the general message and each party row offer share and copy side by side.
    expect(await screen.findByRole("button", { name: "Share general invitation" })).toBeTruthy();
    const copyGeneral = screen.getByRole("button", {
      name: "Copy general invitation instead of sharing",
    });
    expect(
      screen.getByRole("button", {
        name: "Copy invitation for Santos household instead of sharing",
      }),
    ).toBeTruthy();

    fireEvent.click(copyGeneral);

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]?.[0]).toContain("Mara & Joaquin");
    expect(share).not.toHaveBeenCalled();

    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "canShare");
  });

  it("lets a creator write their own message and previews it before saving", async () => {
    vi.mocked(saveInvitationShareMessagesAction).mockResolvedValue({ status: "updated" });
    renderDesk();

    fireEvent.click(screen.getByRole("button", { name: "Write your own" }));
    const personal = screen.getByLabelText("Personal message, for one guest party");
    fireEvent.change(personal, {
      target: { value: "Kumusta {recipient}! Join {celebrant}'s {occasion}: {link}" },
    });

    // The preview resolves the placeholders against real invitation data, not the raw template.
    expect(screen.getByText(/Kumusta Ninang Anika! Join Mara & Joaquin's wedding:/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Save message" }));

    await waitFor(() => expect(saveInvitationShareMessagesAction).toHaveBeenCalledOnce());
    expect(saveInvitationShareMessagesAction).toHaveBeenCalledWith({
      general: "",
      invitationId: invitation.invitationId,
      personal: "Kumusta {recipient}! Join {celebrant}'s {occasion}: {link}",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("confirms a saved message beside the button rather than closing in silence", async () => {
    vi.mocked(saveInvitationShareMessagesAction).mockResolvedValue({ status: "updated" });
    renderDesk();

    fireEvent.click(screen.getByRole("button", { name: "Write your own" }));
    fireEvent.change(screen.getByLabelText("Personal message, for one guest party"), {
      target: { value: "Kumusta {recipient}! {link}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));

    await waitFor(() =>
      expect(screen.getByText(/Saved\. Your message is what guests will receive/)).toBeDefined(),
    );
    // The editor closes, so the confirmation has to survive on the desk.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says so plainly when the creator clears their wording", async () => {
    vi.mocked(saveInvitationShareMessagesAction).mockResolvedValue({ status: "updated" });
    renderDesk();

    fireEvent.click(screen.getByRole("button", { name: "Write your own" }));
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));

    await waitFor(() => expect(screen.getByText(/Your own wording was removed/)).toBeDefined());
  });

  it("keeps the editor open with the creator's text when a save fails", async () => {
    vi.mocked(saveInvitationShareMessagesAction).mockResolvedValue({
      message: "Keep {link} so guests can open the invitation.",
      status: "error",
    });
    renderDesk();

    fireEvent.click(screen.getByRole("button", { name: "Write your own" }));
    const field = screen.getByLabelText("Personal message, for one guest party");
    fireEvent.change(field, { target: { value: "Kumusta po!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.getByRole("alert").textContent).toContain("Keep {link}");
    // Losing what they typed would be worse than the failure itself.
    expect((field as HTMLTextAreaElement).value).toBe("Kumusta po!");
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.queryByText(/Saved\./)).toBeNull();
  });

  it("clears a success confirmation on its own but leaves a failure on screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(saveInvitationShareMessagesAction).mockResolvedValue({ status: "updated" });
      renderDesk();

      fireEvent.click(screen.getByRole("button", { name: "Write your own" }));
      fireEvent.change(screen.getByLabelText("Personal message, for one guest party"), {
        target: { value: "Kumusta {recipient}! {link}" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save message" }));
      await waitFor(() => expect(screen.getByText(/Saved\./)).toBeDefined());

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByText(/Saved\./)).toBeNull();

      // A clipboard failure leaves something the creator still has to do, so it must not expire.
      writeText.mockRejectedValueOnce(new Error("denied"));
      fireEvent.click(screen.getByRole("button", { name: "Copy general invitation" }));
      await waitFor(() =>
        expect(screen.getByText(/Clipboard access was unavailable/)).toBeDefined(),
      );

      await act(async () => {
        vi.advanceTimersByTime(30000);
      });
      expect(screen.getByText(/Clipboard access was unavailable/)).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns that the general link cannot accept the RSVP a custom message asks for", () => {
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Write your own" }));

    const general = screen.getByLabelText("General message, for sharing with everyone");
    expect(screen.queryByText(/cannot accept an RSVP/)).toBeNull();

    fireEvent.change(general, { target: { value: "Please RSVP here: {link}" } });
    expect(screen.getByText(/cannot accept an RSVP/)).toBeDefined();
  });

  it("treats a dismissed share sheet as a decision rather than a failure", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("dismissed", "AbortError"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    renderDesk();

    fireEvent.click(await screen.findByRole("button", { name: "Share general invitation" }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText(/Clipboard access was unavailable/)).toBeNull();

    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "canShare");
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

  it("offers manual copy when the Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Copy general invitation" }));

    expect(
      await screen.findByRole("textbox", { name: "General invitation message" }),
    ).toHaveProperty("value", expect.stringContaining(invitation.genericUrl));
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

  it("re-enables the add-guests composer after a rejected request", async () => {
    vi.mocked(createGuestPartiesAction).mockRejectedValue(new Error("Network unavailable"));
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Add guests" }));
    const nameField = screen.getByLabelText("Guest or party name");
    fireEvent.change(nameField, { target: { value: "John Cruz" } });
    fireEvent.click(screen.getByRole("button", { name: "Create 1 party" }));

    await screen.findByText(/could not create these guest parties/i);
    expect(nameField).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Create 1 party" })).toHaveProperty(
      "disabled",
      false,
    );
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
        hasMoreParties={false}
        invitations={[invitation]}
        nextPartyOffset={0}
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

  it("re-enables restore after a rejected request", async () => {
    vi.mocked(restoreGuestPartyAction).mockRejectedValue(new Error("Network unavailable"));
    renderDesk([], [party({ archivedAt: "2026-07-23T08:00:00+08:00", revision: 2 })]);
    fireEvent.click(screen.getByText("Recently deleted (1)"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await screen.findByText(/could not restore this guest party/i);
    expect(screen.getByRole("button", { name: "Restore" })).toHaveProperty("disabled", false);
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

  it("keeps a confirmation recoverable after a rejected guest action", async () => {
    vi.mocked(trashGuestPartyAction).mockRejectedValue(new Error("Network unavailable"));
    renderDesk([party()]);
    fireEvent.click(screen.getByRole("button", { name: "More actions for Santos household" }));
    fireEvent.click(screen.getByRole("button", { name: "Move party to trash" }));
    fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));

    await screen.findByText(/could not complete this guest action/i);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("button", { name: "Move to trash" })).toHaveProperty("disabled", false);
  });

  // Copy invitation used to resolve its token after the click, which cost several
  // sequential round trips and spent the user gesture the clipboard needs.
  it("copies a prepared invitation without a further server request", async () => {
    const copyText = `Hi Tita Lena!\n${invitation.genericUrl}#g=${"B".repeat(43)}`;
    vi.mocked(prepareGuestInvitationCopiesAction).mockResolvedValue({
      copies: [
        {
          copyText,
          guestPartyId: "73000000-0000-4000-8000-000000000001",
          personalizedUrl: `${invitation.genericUrl}#g=${"B".repeat(43)}`,
        },
      ],
      status: "ready",
    });
    renderDesk([party()]);

    await waitFor(() => expect(prepareGuestInvitationCopiesAction).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Copy invitation for Santos household" }));

    // Written synchronously inside the click, so the gesture is still valid on WebKit.
    expect(writeText).toHaveBeenCalledWith(copyText);
    expect(copyGuestInvitationAction).not.toHaveBeenCalled();
  });

  it("prepares copies only for parties whose private link is still active", async () => {
    vi.mocked(prepareGuestInvitationCopiesAction).mockResolvedValue({
      copies: [],
      status: "ready",
    });
    renderDesk([
      party(),
      party({
        id: "73000000-0000-4000-8000-000000000002",
        internalLabel: "Reyes couple",
        linkStatus: "revoked",
      }),
    ]);

    await waitFor(() => expect(prepareGuestInvitationCopiesAction).toHaveBeenCalledOnce());
    expect(prepareGuestInvitationCopiesAction).toHaveBeenCalledWith({
      guestPartyIds: ["73000000-0000-4000-8000-000000000001"],
      invitationId: invitation.invitationId,
    });
  });

  it("navigates once when a different invitation is chosen", () => {
    renderDesk([party()]);

    fireEvent.click(screen.getByRole("combobox", { name: /Published invitation/ }));
    fireEvent.click(screen.getByRole("option", { name: "Select an invitation" }));

    // The pending skeleton and disabled control that accompany this cannot be asserted
    // here: `router.push` is a synchronous mock, so React ends the transition before
    // the DOM is queried. Only the navigation contract is observable in this harness.
    expect(push).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith("/dashboard/guests");
  });

  it("ignores a repeated selection of the invitation already open", () => {
    renderDesk([party()]);

    fireEvent.click(screen.getByRole("combobox", { name: /Published invitation/ }));
    fireEvent.click(screen.getByRole("option", { name: invitation.title }));

    expect(push).not.toHaveBeenCalled();
  });

  // Copying is evidence of intent, never of delivery: a creator may copy a message and
  // then never paste it. The two states stay separate on purpose.
  it("does not treat a copied invitation as a sent one", async () => {
    const copyText = "Hi Tita Lena!";
    vi.mocked(prepareGuestInvitationCopiesAction).mockResolvedValue({
      copies: [
        {
          copyText,
          guestPartyId: "73000000-0000-4000-8000-000000000001",
          personalizedUrl: `${invitation.genericUrl}#g=${"B".repeat(43)}`,
        },
      ],
      status: "ready",
    });
    vi.mocked(recordGuestInvitationCopyAction).mockResolvedValue({ status: "recorded" });
    renderDesk([party()]);
    await waitFor(() => expect(prepareGuestInvitationCopiesAction).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Copy invitation for Santos household" }));

    expect(writeText).toHaveBeenCalledWith(copyText);
    expect(screen.getByRole("checkbox", { name: /I have sent this/ })).toHaveProperty(
      "checked",
      false,
    );
    expect(setGuestInvitationSentAction).not.toHaveBeenCalled();
  });

  // The clipboard already holds the message before this runs, so a tracking failure must
  // never surface as a failed copy.
  it("records the copy after the clipboard write, not before it", async () => {
    vi.mocked(prepareGuestInvitationCopiesAction).mockResolvedValue({
      copies: [
        {
          copyText: "Hi Tita Lena!",
          guestPartyId: "73000000-0000-4000-8000-000000000001",
          personalizedUrl: `${invitation.genericUrl}#g=${"B".repeat(43)}`,
        },
      ],
      status: "ready",
    });
    vi.mocked(recordGuestInvitationCopyAction).mockResolvedValue({ status: "recorded" });
    renderDesk([party()]);
    await waitFor(() => expect(prepareGuestInvitationCopiesAction).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Copy invitation for Santos household" }));

    expect(writeText).toHaveBeenCalledOnce();
    await waitFor(() => expect(recordGuestInvitationCopyAction).toHaveBeenCalledOnce());
    expect(recordGuestInvitationCopyAction).toHaveBeenCalledWith({
      guestPartyId: "73000000-0000-4000-8000-000000000001",
    });
  });

  it("marks a party as sent on the creator's own say-so", async () => {
    vi.mocked(setGuestInvitationSentAction).mockResolvedValue({ status: "updated" });
    renderDesk([party()]);

    fireEvent.click(screen.getByRole("checkbox", { name: /I have sent this/ }));

    await waitFor(() => expect(setGuestInvitationSentAction).toHaveBeenCalledOnce());
    expect(setGuestInvitationSentAction).toHaveBeenCalledWith({
      guestPartyId: "73000000-0000-4000-8000-000000000001",
      sent: true,
    });
    expect(refresh).toHaveBeenCalled();
  });

  // Reversible on purpose: a mis-tap would otherwise permanently mislabel a guest as
  // contacted, which is the mistake this feature exists to prevent.
  it("lets the creator undo a sent mark", async () => {
    vi.mocked(setGuestInvitationSentAction).mockResolvedValue({ status: "updated" });
    renderDesk([party({ markedSentAt: "2026-07-26T10:00:00+08:00" })]);

    const checkbox = screen.getByRole("checkbox", { name: /Sent/ });
    expect(checkbox).toHaveProperty("checked", true);
    fireEvent.click(checkbox);

    await waitFor(() => expect(setGuestInvitationSentAction).toHaveBeenCalledOnce());
    expect(setGuestInvitationSentAction).toHaveBeenCalledWith({
      guestPartyId: "73000000-0000-4000-8000-000000000001",
      sent: false,
    });
  });

  it("shows the copy history quietly, separately from the sent mark", () => {
    renderDesk([
      party({
        copyCount: 3,
        firstCopiedAt: "2026-07-25T09:00:00+08:00",
        lastCopiedAt: "2026-07-26T10:00:00+08:00",
      }),
    ]);

    expect(screen.getByText(/Copied 3 times/)).toBeDefined();
    expect(screen.getByRole("checkbox", { name: /I have sent this/ })).toHaveProperty(
      "checked",
      false,
    );
  });

  it("reports a failure to save the sent mark instead of silently reverting", async () => {
    vi.mocked(setGuestInvitationSentAction).mockResolvedValue({
      message: "That could not be saved. Refresh and try again.",
      status: "error",
    });
    renderDesk([party()]);

    fireEvent.click(screen.getByRole("checkbox", { name: /I have sent this/ }));

    await waitFor(() =>
      expect(screen.getByText("That could not be saved. Refresh and try again.")).toBeDefined(),
    );
  });

  it("re-enables the sent control after a rejected request", async () => {
    vi.mocked(setGuestInvitationSentAction).mockRejectedValue(new Error("Network unavailable"));
    renderDesk([party()]);
    const checkbox = screen.getByRole("checkbox", { name: /I have sent this/ });
    fireEvent.click(checkbox);

    await screen.findByText(/could not update the sent status/i);
    expect(checkbox).toHaveProperty("disabled", false);
  });

  it("re-enables guest editing after a rejected request", async () => {
    vi.mocked(updateGuestPartyAction).mockRejectedValue(new Error("Network unavailable"));
    renderDesk([party()]);
    fireEvent.click(screen.getByRole("button", { name: "More actions for Santos household" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Santos household" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByText(/could not save this guest party/i);
    expect(screen.getByLabelText("Guest or party name")).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", false);
  });

  it("keeps response filtering on the complete server-side ledger", async () => {
    const attendingParty = party({
      response: {
        attendance: "attending",
        attendeeCount: 2,
        message: "We are delighted to celebrate.",
        updatedAt: "2026-07-23T04:00:00+00:00",
      },
    });
    const awaitingParty = party({
      guestMembers: [],
      id: "73000000-0000-4000-8000-000000000002",
      internalLabel: "Reyes couple",
      recipientName: "Ana and Miguel",
    });
    vi.mocked(loadGuestPartyPageAction).mockResolvedValue({
      page: { hasMore: false, nextOffset: 1, parties: [attendingParty] },
      status: "ready",
    });
    renderDesk([attendingParty, awaitingParty]);

    fireEvent.click(screen.getByRole("combobox", { name: /Response/ }));
    fireEvent.click(screen.getByRole("option", { name: "Attending" }));
    await waitFor(() =>
      expect(loadGuestPartyPageAction).toHaveBeenCalledWith({
        invitationId: invitation.invitationId,
        offset: 0,
        query: "",
        responseFilter: "attending",
      }),
    );
    await waitFor(() => expect(screen.queryByText("Reyes couple")).toBeNull());
    expect(screen.getByText("Santos household")).toBeDefined();
  });

  it("renders the whole-result order returned by the server", () => {
    renderDesk([
      party({
        guestMembers: [],
        id: "73000000-0000-4000-8000-000000000002",
        internalLabel: "Zulueta couple",
        recipientName: "Ana and Miguel",
      }),
      party({
        internalLabel: "Abella family",
        markedSentAt: "2026-07-26T10:00:00+08:00",
      }),
    ]);

    const rows = within(screen.getByRole("table", { name: "Guest party response ledger" }))
      .getAllByRole("row")
      .slice(1);
    expect(within(rows[0] as HTMLElement).getByText("Zulueta couple")).toBeDefined();
    expect(within(rows[1] as HTMLElement).getByText("Abella family")).toBeDefined();
  });

  it("filters parties by sent status across the complete server-side ledger", async () => {
    const unsentParty = party();
    const sentParty = party({
      guestMembers: [],
      id: "73000000-0000-4000-8000-000000000002",
      internalLabel: "Reyes couple",
      markedSentAt: "2026-07-26T10:00:00+08:00",
      recipientName: "Ana and Miguel",
    });
    vi.mocked(loadGuestPartyPageAction).mockImplementation(async (input) => ({
      page: {
        hasMore: false,
        nextOffset: 1,
        parties:
          (input as { responseFilter: string }).responseFilter === "already-sent"
            ? [sentParty]
            : [unsentParty],
      },
      status: "ready",
    }));
    renderDesk([unsentParty, sentParty]);

    const responseFilter = screen.getByRole("combobox", { name: /Response/ });
    fireEvent.click(responseFilter);
    fireEvent.click(screen.getByRole("option", { name: "Not Yet Sent" }));
    await waitFor(() => expect(screen.queryByText("Reyes couple")).toBeNull());
    expect(screen.getByText("Santos household")).toBeDefined();

    fireEvent.click(responseFilter);
    fireEvent.click(screen.getByRole("option", { name: "Already Sent" }));
    await waitFor(() => expect(screen.queryByText("Santos household")).toBeNull());
    expect(screen.getByText("Reyes couple")).toBeDefined();
  });

  it("loads the next server page without refreshing and hides the action at the end", async () => {
    const nextParty = party({
      guestMembers: [],
      id: "73000000-0000-4000-8000-000000000002",
      internalLabel: "Reyes couple",
      recipientName: "Ana and Miguel",
    });
    vi.mocked(loadGuestPartyPageAction).mockResolvedValue({
      page: { hasMore: false, nextOffset: 21, parties: [nextParty] },
      status: "ready",
    });
    renderDesk([party()], [], { hasMore: true, nextOffset: 20 });

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));

    await waitFor(() =>
      expect(loadGuestPartyPageAction).toHaveBeenCalledWith({
        invitationId: invitation.invitationId,
        offset: 20,
        query: "",
        responseFilter: "all",
      }),
    );
    expect(await screen.findByText("Reyes couple")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Load More" })).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("resets pagination when a search query changes", async () => {
    const match = party({
      guestMembers: [],
      id: "73000000-0000-4000-8000-000000000003",
      internalLabel: "Navarro family",
      recipientName: "Celia Navarro",
    });
    vi.mocked(loadGuestPartyPageAction).mockResolvedValue({
      page: { hasMore: false, nextOffset: 1, parties: [match] },
      status: "ready",
    });
    renderDesk([party()], [], { hasMore: true, nextOffset: 20 });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search parties or guests" }), {
      target: { value: "Navarro" },
    });

    await waitFor(() =>
      expect(loadGuestPartyPageAction).toHaveBeenCalledWith({
        invitationId: invitation.invitationId,
        offset: 0,
        query: "Navarro",
        responseFilter: "all",
      }),
    );
    expect(await screen.findByText("Navarro family")).toBeDefined();
    expect(screen.queryByText("Santos household")).toBeNull();
  });
});
