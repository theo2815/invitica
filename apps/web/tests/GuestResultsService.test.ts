import { describe, expect, it, vi } from "vitest";

import { listGuestParties } from "../src/server/guests/guests";
import {
  GuestResultPersistenceError,
  listInvitationResultSummaries,
} from "../src/server/guests/results";

const workspaceId = "71000000-0000-4000-8000-000000000001";
const invitationId = "72000000-0000-4000-8000-000000000001";
const attendingPartyId = "73000000-0000-4000-8000-000000000001";
const awaitingPartyId = "73000000-0000-4000-8000-000000000002";

function summaryClient(records: Record<string, unknown[]>, errorTable?: string) {
  const eqByTable = new Map<string, ReturnType<typeof vi.fn>>();
  const from = vi.fn((table: string) => {
    const eq = vi
      .fn()
      .mockResolvedValue({ data: records[table] ?? [], error: table === errorTable ? {} : null });
    eqByTable.set(table, eq);
    return { select: vi.fn().mockReturnValue({ eq }) };
  });
  return { eqByTable, from };
}

describe("creator invitation result summaries", () => {
  it("derives party and people counts separately while summing daily views", async () => {
    const client = summaryClient({
      guest_parties: [
        { capacity: 4, id: attendingPartyId, invitation_id: invitationId },
        { capacity: 2, id: awaitingPartyId, invitation_id: invitationId },
      ],
      invitation_view_daily: [
        {
          invitation_id: invitationId,
          last_viewed_at: "2026-07-22T03:00:00+00:00",
          view_count: 5,
        },
        {
          invitation_id: invitationId,
          last_viewed_at: "2026-07-23T05:00:00+00:00",
          view_count: 7,
        },
      ],
      rsvp_responses: [
        {
          attendance: "attending",
          attendee_count: 3,
          guest_party_id: attendingPartyId,
          invitation_id: invitationId,
          updated_at: "2026-07-23T04:00:00+00:00",
        },
      ],
    });

    await expect(listInvitationResultSummaries(client as never, workspaceId)).resolves.toEqual({
      [invitationId]: {
        attendingGuests: 3,
        attendingParties: 1,
        awaitingParties: 1,
        declinedParties: 0,
        guestPartyCount: 2,
        invitationId,
        lastResponseAt: "2026-07-23T04:00:00+00:00",
        lastViewedAt: "2026-07-23T05:00:00+00:00",
        reservedSeats: 6,
        viewCount: 12,
      },
    });
    expect(client.eqByTable.get("guest_parties")).toHaveBeenCalledWith("workspace_id", workspaceId);
    expect(client.eqByTable.get("rsvp_responses")).toHaveBeenCalledWith(
      "workspace_id",
      workspaceId,
    );
    expect(client.eqByTable.get("invitation_view_daily")).toHaveBeenCalledWith(
      "workspace_id",
      workspaceId,
    );
  });

  it("does not turn a failed private query into truthful-looking zeroes", async () => {
    const client = summaryClient({}, "rsvp_responses");
    await expect(
      listInvitationResultSummaries(client as never, workspaceId),
    ).rejects.toBeInstanceOf(GuestResultPersistenceError);
  });
});

function ledgerClient() {
  const from = vi.fn((table: string) => {
    if (table === "guest_parties") {
      const order = vi.fn().mockResolvedValue({
        data: [
          {
            capacity: 4,
            created_at: "2026-07-22T02:00:00+00:00",
            id: attendingPartyId,
            internal_label: "Santos household",
            recipient_name: "Tita Lena and family",
          },
        ],
        error: null,
      });
      const invitationEq = vi.fn().mockReturnValue({ order });
      const workspaceEq = vi.fn().mockReturnValue({ eq: invitationEq });
      return { select: vi.fn().mockReturnValue({ eq: workspaceEq }) };
    }

    const records = {
      guest_party_links: [
        {
          created_at: "2026-07-22T02:00:00+00:00",
          guest_party_id: attendingPartyId,
          id: "74000000-0000-4000-8000-000000000001",
          revoked_at: null,
          status: "active",
        },
      ],
      guests: [
        {
          guest_party_id: attendingPartyId,
          id: "75000000-0000-4000-8000-000000000001",
          name: "Lena Santos",
          sort_order: 1,
        },
      ],
      rsvp_responses: [
        {
          attendance: "attending",
          attendee_count: 3,
          guest_party_id: attendingPartyId,
          message: "We are delighted to celebrate.",
          updated_at: "2026-07-23T04:00:00+00:00",
        },
      ],
    }[table];
    const terminal = Promise.resolve({ data: records ?? [], error: null });
    const order = vi.fn().mockReturnValue(terminal);
    const inFilter = vi.fn().mockReturnValue(table === "rsvp_responses" ? terminal : { order });
    const eq = vi.fn().mockReturnValue({ in: inFilter });
    return { select: vi.fn().mockReturnValue({ eq }) };
  });
  return { from };
}

describe("creator RSVP ledger", () => {
  it("joins the private party response without exposing mutation metadata", async () => {
    const parties = await listGuestParties(ledgerClient() as never, workspaceId, invitationId);
    expect(parties).toEqual([
      {
        capacity: 4,
        createdAt: "2026-07-22T02:00:00+00:00",
        guestNames: ["Lena Santos"],
        id: attendingPartyId,
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
    ]);
  });
});
