import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuestDesk } from "../src/components/guests/GuestDesk";
import {
  createGuestPartyAction,
  replaceGuestPartyLinkAction,
  revokeGuestPartyLinkAction,
} from "../src/server/guests/actions";

const push = vi.fn();
const refresh = vi.fn();
const writeText = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../src/server/guests/actions", () => ({
  createGuestPartyAction: vi.fn(),
  replaceGuestPartyLinkAction: vi.fn(),
  revokeGuestPartyLinkAction: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(cleanup);

describe("GuestDesk", () => {
  it("creates a party and reveals its personalized link exactly in the action result", async () => {
    const personalizedUrl = `${invitation.genericUrl}#g=${"A".repeat(43)}`;
    vi.mocked(createGuestPartyAction).mockResolvedValue({
      partyId: "73000000-0000-4000-8000-000000000001",
      personalizedUrl,
      status: "created",
    });
    render(
      <GuestDesk
        invitations={[invitation]}
        parties={[]}
        resultSummary={resultSummary}
        selectedInvitation={invitation}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add guest party" }));
    fireEvent.change(screen.getByLabelText("Internal party label"), {
      target: { value: "Santos household" },
    });
    fireEvent.change(screen.getByLabelText("Envelope greeting"), {
      target: { value: "Tita Lena and family" },
    });
    fireEvent.change(screen.getByLabelText("Party capacity"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/Named guests/), {
      target: { value: "Lena Santos\nPaolo Santos" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create party & link" }));

    await waitFor(() => expect(createGuestPartyAction).toHaveBeenCalledOnce());
    expect(createGuestPartyAction).toHaveBeenCalledWith({
      capacity: 4,
      guestNames: ["Lena Santos", "Paolo Santos"],
      internalLabel: "Santos household",
      invitationId: invitation.invitationId,
      recipientName: "Tita Lena and family",
    });
    expect(screen.getByRole("heading", { name: "Copy this private link now" })).toBeDefined();
    expect(screen.getByLabelText("New personalized invitation link").getAttribute("value")).toBe(
      personalizedUrl,
    );
    expect(screen.getByRole("status").textContent).toContain("cannot be shown again");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("rejects more named guests than the declared capacity before mutation", () => {
    render(
      <GuestDesk
        invitations={[invitation]}
        parties={[]}
        resultSummary={resultSummary}
        selectedInvitation={invitation}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add guest party" }));
    fireEvent.change(screen.getByLabelText("Internal party label"), { target: { value: "Group" } });
    fireEvent.change(screen.getByLabelText("Envelope greeting"), { target: { value: "Friends" } });
    fireEvent.change(screen.getByLabelText("Party capacity"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/Named guests/), { target: { value: "One\nTwo" } });
    fireEvent.click(screen.getByRole("button", { name: "Create party & link" }));

    expect(screen.getByRole("status").textContent).toContain("cannot exceed");
    expect(createGuestPartyAction).not.toHaveBeenCalled();
  });

  it("copies the general link without exposing a guest identity", async () => {
    writeText.mockResolvedValue(undefined);
    render(
      <GuestDesk
        invitations={[invitation]}
        parties={[]}
        resultSummary={resultSummary}
        selectedInvitation={invitation}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy general link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(invitation.genericUrl));
    const generalLink = screen.getByRole("region", { name: "A welcoming link for every guest" });
    expect(within(generalLink).getByRole("button", { name: "Copied" })).toBeDefined();
    expect(within(generalLink).getByRole("status").textContent).toBe(
      "General link copied to your clipboard.",
    );
  });

  it("selects the general link and explains when clipboard access fails", async () => {
    writeText.mockRejectedValue(new Error("Clipboard unavailable"));
    render(
      <GuestDesk
        invitations={[invitation]}
        parties={[]}
        resultSummary={resultSummary}
        selectedInvitation={invitation}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy general link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(invitation.genericUrl));
    const link = screen.getByLabelText("General invitation link");
    expect(document.activeElement).toBe(link);
    const generalLink = screen.getByRole("region", { name: "A welcoming link for every guest" });
    expect(within(generalLink).getByRole("status").textContent).toBe(
      "Copy was unavailable. The link is selected for manual copying.",
    );
  });

  it("requires confirmation before revoking an active party link", async () => {
    vi.mocked(revokeGuestPartyLinkAction).mockResolvedValue({ status: "revoked" });
    render(
      <GuestDesk
        invitations={[invitation]}
        parties={[
          {
            capacity: 4,
            createdAt: "2026-07-22T08:00:00+08:00",
            guestNames: ["Lena Santos"],
            id: "73000000-0000-4000-8000-000000000001",
            internalLabel: "Santos household",
            linkStatus: "active",
            recipientName: "Tita Lena and family",
            response: null,
          },
        ]}
        resultSummary={{
          ...resultSummary,
          awaitingParties: 1,
          guestPartyCount: 1,
          reservedSeats: 4,
        }}
        selectedInvitation={invitation}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Revoke link" }));
    expect(revokeGuestPartyLinkAction).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Revoke this personalized link?" })).toBeDefined();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke link" }),
    );

    await waitFor(() => expect(revokeGuestPartyLinkAction).toHaveBeenCalledOnce());
    expect(revokeGuestPartyLinkAction).toHaveBeenCalledWith({
      guestPartyId: "73000000-0000-4000-8000-000000000001",
      invitationId: invitation.invitationId,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("replaces a link with a new one-time reveal", async () => {
    const replacement = `${invitation.genericUrl}#g=${"B".repeat(43)}`;
    vi.mocked(replaceGuestPartyLinkAction).mockResolvedValue({
      personalizedUrl: replacement,
      status: "replaced",
    });
    render(
      <GuestDesk
        invitations={[invitation]}
        parties={[
          {
            capacity: 2,
            createdAt: "2026-07-22T08:00:00+08:00",
            guestNames: [],
            id: "73000000-0000-4000-8000-000000000001",
            internalLabel: "Reyes couple",
            linkStatus: "active",
            recipientName: "Ana and Miguel",
            response: null,
          },
        ]}
        resultSummary={{
          ...resultSummary,
          awaitingParties: 1,
          guestPartyCount: 1,
          reservedSeats: 2,
        }}
        selectedInvitation={invitation}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions for Reyes couple" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace link" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Replace link" }),
    );

    await waitFor(() => expect(replaceGuestPartyLinkAction).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("New personalized invitation link").getAttribute("value")).toBe(
      replacement,
    );
  });

  it("shows real RSVP details and filters the private response ledger", () => {
    render(
      <GuestDesk
        invitations={[invitation]}
        parties={[
          {
            capacity: 4,
            createdAt: "2026-07-22T08:00:00+08:00",
            guestNames: ["Lena Santos", "Paolo Santos"],
            id: "73000000-0000-4000-8000-000000000001",
            internalLabel: "Santos household",
            linkStatus: "active",
            recipientName: "Tita Lena and family",
            response: {
              attendance: "attending",
              attendeeCount: 3,
              message: "We are delighted to celebrate.",
              updatedAt: "2026-07-23T04:00:00+00:00",
            },
          },
          {
            capacity: 2,
            createdAt: "2026-07-22T09:00:00+08:00",
            guestNames: [],
            id: "73000000-0000-4000-8000-000000000002",
            internalLabel: "Reyes couple",
            linkStatus: "revoked",
            recipientName: "Ana and Miguel",
            response: null,
          },
        ]}
        resultSummary={{
          ...resultSummary,
          attendingGuests: 3,
          attendingParties: 1,
          awaitingParties: 1,
          guestPartyCount: 2,
          reservedSeats: 6,
          viewCount: 12,
        }}
        selectedInvitation={invitation}
      />,
    );

    const ledger = screen.getByRole("table", { name: "Guest party response ledger" });
    expect(within(ledger).getByText("We are delighted to celebrate.")).toBeDefined();
    expect(within(ledger).getByText("3 attending")).toBeDefined();
    expect(within(ledger).getByText("Link revoked")).toBeDefined();

    fireEvent.click(screen.getByRole("combobox", { name: /Response/ }));
    fireEvent.click(screen.getByRole("option", { name: "Attending" }));
    expect(within(ledger).getByText("Santos household")).toBeDefined();
    expect(within(ledger).queryByText("Reyes couple")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search parties or guests"), {
      target: { value: "not present" },
    });
    expect(screen.getByText("No matching guest parties")).toBeDefined();
  });

  it("keeps keyboard focus inside the create dialog and restores its trigger", () => {
    render(
      <GuestDesk
        invitations={[invitation]}
        parties={[]}
        resultSummary={resultSummary}
        selectedInvitation={invitation}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Add guest party" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    const firstField = within(dialog).getByLabelText("Internal party label");
    const submit = within(dialog).getByRole("button", { name: "Create party & link" });
    firstField.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(submit);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
