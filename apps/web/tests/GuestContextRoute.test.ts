import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/public/guest-context/route";
import { createAdminClient } from "../src/lib/supabase/admin";
import { resolveGuestRsvpContext } from "../src/server/guests/rsvps";
import { hashGuestLinkToken } from "../src/server/guests/tokens";

vi.mock("../src/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("../src/server/guests/rsvps", () => ({ resolveGuestRsvpContext: vi.fn() }));
vi.mock("../src/server/guests/tokens", () => ({ hashGuestLinkToken: vi.fn() }));

const token = "A".repeat(43);
const publicIdentifier = "a".repeat(32);
const hash = "b".repeat(64);

function request(body: unknown, contentType = "application/json") {
  return new Request("https://invitica.app/api/public/guest-context", {
    body: JSON.stringify(body),
    headers: { "content-type": contentType },
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue({} as never);
  vi.mocked(hashGuestLinkToken).mockReturnValue(hash);
});

describe("public guest context route", () => {
  it("returns only the resolved party RSVP context with private no-store headers", async () => {
    const context = {
      recipientName: "Tita Lena and family",
      rsvp: { capacity: 4, deadline: null, response: null, status: "open" as const },
    };
    vi.mocked(resolveGuestRsvpContext).mockResolvedValue(context);
    const response = await POST(request({ publicIdentifier, token }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(context);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(hashGuestLinkToken).toHaveBeenCalledWith(token);
    expect(resolveGuestRsvpContext).toHaveBeenCalledWith({}, publicIdentifier, hash);
  });

  it("uses one neutral unavailable response for malformed and revoked links", async () => {
    vi.mocked(resolveGuestRsvpContext).mockResolvedValue(null);
    const malformed = await POST(request({ publicIdentifier, token: "short" }));
    const revoked = await POST(request({ publicIdentifier, token }));

    expect(malformed.status).toBe(404);
    expect(revoked.status).toBe(404);
    expect(await malformed.text()).toBe(await revoked.text());
    expect(
      (await POST(request({ publicIdentifier, token: "short" }))).headers.get("cache-control"),
    ).toBe("private, no-store");
  });

  it("rejects non-JSON and oversized requests before guest resolution", async () => {
    const nonJson = await POST(request({ publicIdentifier, token }, "text/plain"));
    const oversized = await POST(
      new Request("https://invitica.app/api/public/guest-context", {
        body: "{}",
        headers: { "content-length": "4096", "content-type": "application/json" },
        method: "POST",
      }),
    );

    const unreportedOversized = await POST(
      new Request("https://invitica.app/api/public/guest-context", {
        body: JSON.stringify({ padding: "x".repeat(2_049) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(nonJson.status).toBe(415);
    expect(oversized.status).toBe(400);
    expect(unreportedOversized.status).toBe(400);
    expect(resolveGuestRsvpContext).not.toHaveBeenCalled();
  });

  it("keeps service failures generic without returning private details", async () => {
    vi.mocked(resolveGuestRsvpContext).mockRejectedValue(new Error("private database detail"));
    const response = await POST(request({ publicIdentifier, token }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database detail");
    expect(
      await POST(request({ publicIdentifier, token })).then((result) => result.json()),
    ).toEqual({
      status: "unavailable",
    });
  });
});
