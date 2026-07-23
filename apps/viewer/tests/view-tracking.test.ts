import { describe, expect, it, vi } from "vitest";

import { recordPublicationView } from "../src/view-tracking";

describe("privacy-safe publication view tracking", () => {
  it("sends only the stable public identifier with no referrer or credentials", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const publicIdentifier = "a".repeat(32);

    await recordPublicationView(publicIdentifier, request);

    expect(request).toHaveBeenCalledWith("/api/public/view", {
      body: JSON.stringify({ publicIdentifier }),
      cache: "no-store",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
      referrerPolicy: "no-referrer",
    });
    expect(request.mock.calls[0]?.[1]?.body).not.toContain("#g=");
  });

  it("never lets measurement failure break invitation hydration", async () => {
    const request = vi.fn().mockRejectedValue(new Error("measurement unavailable"));
    await expect(recordPublicationView("a".repeat(32), request)).resolves.toBeUndefined();
  });
});
