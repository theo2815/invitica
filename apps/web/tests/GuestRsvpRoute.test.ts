import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/public/rsvp/route";
import { createAdminClient } from "../src/lib/supabase/admin";
import { GuestRsvpPersistenceError, submitGuestRsvp } from "../src/server/guests/rsvps";
import { hashGuestLinkToken } from "../src/server/guests/tokens";

vi.mock("../src/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("../src/server/guests/rsvps", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/server/guests/rsvps")>();
  return { ...original, submitGuestRsvp: vi.fn() };
});
vi.mock("../src/server/guests/tokens", () => ({ hashGuestLinkToken: vi.fn() }));

const token = "A".repeat(43);
const publicIdentifier = "a".repeat(32);
const tokenHash = "b".repeat(64);
const body = {
  attendance: "attending",
  attendeeCount: 2,
  expectedRevision: 0,
  message: "See you there.",
  mutationId: "10000000-0000-4000-8000-000000000001",
  publicIdentifier,
  token,
};

function request(value: unknown, contentType = "application/json") {
  return new Request("https://invitica.app/api/public/rsvp", {
    body: JSON.stringify(value),
    headers: { "content-type": contentType },
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue({} as never);
  vi.mocked(hashGuestLinkToken).mockReturnValue(tokenHash);
});

describe("public RSVP route", () => {
  it("returns a minimal saved response with private no-store headers", async () => {
    const saved = {
      attendance: "attending" as const,
      attendeeCount: 2,
      message: "See you there.",
      revision: 1,
      updatedAt: "2026-07-23T10:00:00+08:00",
    };
    vi.mocked(submitGuestRsvp).mockResolvedValue(saved);

    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ response: saved });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(hashGuestLinkToken).toHaveBeenCalledWith(token);
    expect(submitGuestRsvp).toHaveBeenCalledWith({}, body, tokenHash);
  });

  it("rejects malformed, non-JSON, and oversized bodies before persistence", async () => {
    expect((await POST(request({ ...body, attendeeCount: 0 }))).status).toBe(400);
    expect((await POST(request(body, "text/plain"))).status).toBe(415);
    expect(
      (
        await POST(
          new Request("https://invitica.app/api/public/rsvp", {
            body: "{}",
            headers: { "content-length": "4096", "content-type": "application/json" },
            method: "POST",
          }),
        )
      ).status,
    ).toBe(400);
    expect(submitGuestRsvp).not.toHaveBeenCalled();
  });

  it.each([
    ["closed", 410],
    ["conflict", 409],
    ["invalid", 400],
    ["unavailable", 404],
    ["service", 503],
  ] as const)("maps %s failures without private detail", async (kind, status) => {
    vi.mocked(submitGuestRsvp).mockRejectedValue(new GuestRsvpPersistenceError(kind));
    const response = await POST(request(body));
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("database");
  });
});
