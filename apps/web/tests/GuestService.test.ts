import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGenericInvitationUrl,
  buildPersonalizedInvitationUrl,
  GuestPersistenceError,
  listGuestPartyPage,
  updateGuestParty,
} from "../src/server/guests/guests";

const originalInvitationOrigin = process.env.NEXT_PUBLIC_INVITATION_ORIGIN;

afterEach(() => {
  if (originalInvitationOrigin === undefined) {
    delete process.env.NEXT_PUBLIC_INVITATION_ORIGIN;
  } else {
    process.env.NEXT_PUBLIC_INVITATION_ORIGIN = originalInvitationOrigin;
  }
});

describe("guest invitation URLs", () => {
  it("builds a stable generic URL from public event context", () => {
    process.env.NEXT_PUBLIC_INVITATION_ORIGIN = "https://invitica.example";
    const identifier = "0123456789abcdef0123456789abcdef";

    expect(buildGenericInvitationUrl("  Álthea & Nicolás  ", identifier)).toBe(
      `https://invitica.example/i/althea-nicolas-${identifier}`,
    );
  });

  it("upgrades a plaintext hosted origin so no guest is sent an http link", () => {
    process.env.NEXT_PUBLIC_INVITATION_ORIGIN = "http://invitica.app";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const identifier = "0123456789abcdef0123456789abcdef";

    expect(buildGenericInvitationUrl("Mara & Joaquin", identifier)).toBe(
      `https://invitica.app/i/mara-joaquin-${identifier}`,
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("leaves a local development origin on http", () => {
    process.env.NEXT_PUBLIC_INVITATION_ORIGIN = "http://localhost:3000";
    const identifier = "0123456789abcdef0123456789abcdef";

    expect(buildGenericInvitationUrl("Mara & Joaquin", identifier)).toBe(
      `http://localhost:3000/i/mara-joaquin-${identifier}`,
    );
  });

  it("keeps the raw personalized token in the fragment", () => {
    const token = "A".repeat(43);
    const personalized = new URL(
      buildPersonalizedInvitationUrl(
        "https://invitica.example/i/althea-0123456789abcdef0123456789abcdef",
        token,
      ),
    );

    expect(personalized.pathname).toBe("/i/althea-0123456789abcdef0123456789abcdef");
    expect(personalized.search).toBe("");
    expect(personalized.hash).toBe(`#g=${token}`);
  });

  it("rejects malformed token material before building a personalized URL", () => {
    expect(() =>
      buildPersonalizedInvitationUrl(
        "https://invitica.example/i/althea-0123456789abcdef0123456789abcdef",
        "guest-name",
      ),
    ).toThrow();
  });
});

describe("guest-party editing", () => {
  it("maps a revision-safe edit to the narrow database RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });

    await updateGuestParty({ rpc } as never, {
      capacity: 4,
      expectedRevision: 3,
      guestNames: ["Mara Santos", "Paolo Santos"],
      guestPartyId: "11111111-1111-4111-8111-111111111111",
      internalLabel: "Santos family",
      recipientName: "Mara and Paolo",
    });

    expect(rpc).toHaveBeenCalledWith("update_guest_party", {
      p_capacity: 4,
      p_expected_revision: 3,
      p_guest_names: ["Mara Santos", "Paolo Santos"],
      p_guest_party_id: "11111111-1111-4111-8111-111111111111",
      p_internal_label: "Santos family",
      p_recipient_name: "Mara and Paolo",
    });
  });

  it("returns the domain-safe persistence error when the RPC fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: "40001" } });

    await expect(
      updateGuestParty({ rpc } as never, {
        capacity: 1,
        expectedRevision: 1,
        guestNames: ["Mara Santos"],
        guestPartyId: "11111111-1111-4111-8111-111111111111",
        internalLabel: "Mara Santos",
        recipientName: "Mara Santos",
      }),
    ).rejects.toBeInstanceOf(GuestPersistenceError);
  });
});

describe("guest-party pagination", () => {
  it("requests one extra row and returns a bounded mapped page", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: Array.from({ length: 21 }, (_, index) => ({
        archived_at: null,
        capacity: 2,
        copy_count: 0,
        created_at: "2026-07-22T08:00:00+08:00",
        first_copied_at: null,
        guest_members:
          index === 0 ? [{ id: "74000000-0000-4000-8000-000000000001", name: "Lena Santos" }] : [],
        id: `73000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        internal_label: `Party ${index + 1}`,
        last_copied_at: null,
        link_status: index === 0 ? "active" : "revoked",
        marked_sent_at: null,
        recipient_name: `Recipient ${index + 1}`,
        response_attendance: index === 0 ? "attending" : null,
        response_attendee_count: index === 0 ? 2 : null,
        response_message: index === 0 ? "We will be there." : null,
        response_updated_at: index === 0 ? "2026-07-23T04:00:00+00:00" : null,
        revision: 1,
      })),
      error: null,
    });

    const page = await listGuestPartyPage(
      { rpc } as never,
      "71000000-0000-4000-8000-000000000001",
      "72000000-0000-4000-8000-000000000001",
      { offset: 40, query: "Santos", responseFilter: "not-yet-sent" },
    );

    expect(rpc).toHaveBeenCalledWith("list_guest_parties_page", {
      p_invitation_id: "72000000-0000-4000-8000-000000000001",
      p_limit: 21,
      p_offset: 40,
      p_response_filter: "not-yet-sent",
      p_search: "Santos",
    });
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(60);
    expect(page.parties).toHaveLength(20);
    expect(page.parties[0]).toMatchObject({
      guestMembers: [{ id: "74000000-0000-4000-8000-000000000001", name: "Lena Santos" }],
      linkStatus: "active",
      response: {
        attendance: "attending",
        attendeeCount: 2,
        message: "We will be there.",
      },
    });
  });

  it("does not expose database read failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await expect(
      listGuestPartyPage(
        { rpc } as never,
        "71000000-0000-4000-8000-000000000001",
        "72000000-0000-4000-8000-000000000001",
        { offset: 0, query: "", responseFilter: "all" },
      ),
    ).rejects.toBeInstanceOf(GuestPersistenceError);
    consoleError.mockRestore();
  });
});
