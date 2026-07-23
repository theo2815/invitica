import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGenericInvitationUrl,
  buildPersonalizedInvitationUrl,
  GuestPersistenceError,
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
