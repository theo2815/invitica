import type { GuestRsvpMutationRequest } from "@invitica/invitation-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  GuestRsvpPersistenceError,
  resolveGuestRsvpContext,
  submitGuestRsvp,
} from "../src/server/guests/rsvps";

const publicIdentifier = "a".repeat(32);
const tokenHash = "b".repeat(64);
const updatedAt = "2026-07-23T10:00:00+08:00";

function client(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

const mutation: GuestRsvpMutationRequest = {
  attendance: "attending",
  attendeeCount: 3,
  expectedRevision: 0,
  message: "We are excited to celebrate.",
  mutationId: "10000000-0000-4000-8000-000000000001",
  publicIdentifier,
  token: "A".repeat(43),
};

describe("guest RSVP persistence service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps a valid party capability to minimal RSVP context", async () => {
    const supabase = client({
      data: [
        {
          can_respond: true,
          has_rsvp_section: true,
          party_capacity: 4,
          recipient_name: "Tita Lena and family",
          response_attendance: null,
          response_attendee_count: null,
          response_message: null,
          response_revision: null,
          response_updated_at: null,
          rsvp_deadline: "2099-12-01T00:00:00+08:00",
        },
      ],
      error: null,
    });

    await expect(
      resolveGuestRsvpContext(supabase as never, publicIdentifier, tokenHash),
    ).resolves.toEqual({
      recipientName: "Tita Lena and family",
      rsvp: {
        capacity: 4,
        deadline: "2099-12-01T00:00:00+08:00",
        response: null,
        status: "open",
      },
    });
    expect(supabase.rpc).toHaveBeenCalledWith("resolve_guest_rsvp_context", {
      p_public_identifier: publicIdentifier,
      p_token_hash: tokenHash,
    });
  });

  it("preserves a closed party's existing response without allowing edits", async () => {
    const supabase = client({
      data: [
        {
          can_respond: false,
          has_rsvp_section: true,
          party_capacity: 2,
          recipient_name: "Our dear friends",
          response_attendance: "declined",
          response_attendee_count: 0,
          response_message: null,
          response_revision: 2,
          response_updated_at: updatedAt,
          rsvp_deadline: "2026-01-01T00:00:00+08:00",
        },
      ],
      error: null,
    });

    const result = await resolveGuestRsvpContext(supabase as never, publicIdentifier, tokenHash);
    expect(result?.rsvp.status).toBe("closed");
    expect(result?.rsvp.response?.revision).toBe(2);
  });

  it("returns null for unknown capabilities and hides service details", async () => {
    await expect(
      resolveGuestRsvpContext(
        client({ data: [], error: null }) as never,
        publicIdentifier,
        tokenHash,
      ),
    ).resolves.toBeNull();
    await expect(
      resolveGuestRsvpContext(
        client({ data: null, error: { code: "private", message: "database detail" } }) as never,
        publicIdentifier,
        tokenHash,
      ),
    ).rejects.toEqual(new GuestRsvpPersistenceError("service"));
  });

  it("submits the exact retry and revision contract to PostgreSQL", async () => {
    const supabase = client({
      data: [
        {
          response_attendance: "attending",
          response_attendee_count: 3,
          response_message: mutation.message,
          response_revision: 1,
          response_updated_at: updatedAt,
        },
      ],
      error: null,
    });

    await expect(submitGuestRsvp(supabase as never, mutation, tokenHash)).resolves.toEqual({
      attendance: "attending",
      attendeeCount: 3,
      message: mutation.message,
      revision: 1,
      updatedAt,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("submit_guest_rsvp", {
      p_attendance: "attending",
      p_attendee_count: 3,
      p_expected_revision: 0,
      p_message: mutation.message,
      p_mutation_id: mutation.mutationId,
      p_public_identifier: publicIdentifier,
      p_token_hash: tokenHash,
    });
  });

  it.each([
    ["22023", "invalid"],
    ["23514", "invalid"],
    ["40001", "conflict"],
    ["P0001", "closed"],
    ["P0002", "unavailable"],
    ["XX000", "service"],
  ] as const)("maps database code %s to public-safe %s", async (code, kind) => {
    await expect(
      submitGuestRsvp(client({ data: null, error: { code } }) as never, mutation, tokenHash),
    ).rejects.toMatchObject({ kind });
  });
});
