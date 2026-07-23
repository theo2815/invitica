import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/public/view/route";
import { createAdminClient } from "../src/lib/supabase/admin";
import { recordInvitationView } from "../src/server/guests/views";

vi.mock("../src/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("../src/server/guests/views", () => ({ recordInvitationView: vi.fn() }));

const publicIdentifier = "a".repeat(32);

function request(body: unknown, contentType = "application/json") {
  return new Request("https://invitica.app/api/public/view", {
    body: JSON.stringify(body),
    headers: { "content-type": contentType },
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue({} as never);
});

describe("privacy-safe invitation view route", () => {
  it("records only a validated public identifier and returns no content", async () => {
    vi.mocked(recordInvitationView).mockResolvedValue(true);
    const response = await POST(request({ publicIdentifier }));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(recordInvitationView).toHaveBeenCalledWith({}, publicIdentifier);
  });

  it("keeps malformed, unknown, and persistence failures neutral", async () => {
    vi.mocked(recordInvitationView).mockResolvedValue(false);
    const malformed = await POST(request({ publicIdentifier: "short", token: "private" }));
    const unknown = await POST(request({ publicIdentifier }));
    vi.mocked(recordInvitationView).mockRejectedValue(new Error("private provider detail"));
    const failed = await POST(request({ publicIdentifier }));

    expect([malformed.status, unknown.status, failed.status]).toEqual([204, 204, 204]);
    expect(await malformed.text()).toBe(await unknown.text());
    expect(await unknown.text()).toBe(await failed.text());
  });

  it("ignores non-JSON and oversized bodies before persistence", async () => {
    const nonJson = await POST(request({ publicIdentifier }, "text/plain"));
    const oversized = await POST(
      new Request("https://invitica.app/api/public/view", {
        body: "{}",
        headers: { "content-length": "512", "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(nonJson.status).toBe(204);
    expect(oversized.status).toBe(204);
    expect(recordInvitationView).not.toHaveBeenCalled();
  });
});
