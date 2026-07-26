import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumePublicRequest } from "../src/server/guests/throttle";

function client(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as never;
}

function request(headers: Record<string, string> = {}) {
  return new Request("https://invitica.app/api/public/rsvp", { headers, method: "POST" });
}

beforeEach(() => {
  vi.stubEnv("GUEST_LINK_HASH_KEY", Buffer.alloc(32, 7).toString("base64url"));
});

afterEach(() => vi.unstubAllEnvs());

describe("public endpoint throttle", () => {
  it("sends a scoped keyed hash and never the caller's address", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await consumePublicRequest(client(rpc), "rsvp", request({ "x-forwarded-for": "203.0.113.7" }));

    const [name, parameters] = rpc.mock.calls[0] ?? [];
    expect(name).toBe("consume_public_request");
    expect(parameters.p_bucket_key).toMatch(/^rsvp:[0-9a-f]{64}$/);
    expect(JSON.stringify(parameters)).not.toContain("203.0.113.7");
  });

  it("gives each caller and each scope its own bucket, stably", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const first = request({ "x-forwarded-for": "203.0.113.7" });
    const second = request({ "x-forwarded-for": "198.51.100.9" });

    await consumePublicRequest(client(rpc), "rsvp", first);
    await consumePublicRequest(client(rpc), "rsvp", first);
    await consumePublicRequest(client(rpc), "rsvp", second);
    await consumePublicRequest(client(rpc), "view", first);

    const keys = rpc.mock.calls.map(([, parameters]) => parameters.p_bucket_key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
    expect(keys[3]).toBe(keys[0].replace("rsvp:", "view:"));
  });

  it("takes the leftmost forwarded address, then x-real-ip, then one shared bucket", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await consumePublicRequest(
      client(rpc),
      "rsvp",
      request({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }),
    );
    await consumePublicRequest(client(rpc), "rsvp", request({ "x-real-ip": "203.0.113.7" }));
    await consumePublicRequest(client(rpc), "rsvp", request());

    const keys = rpc.mock.calls.map(([, parameters]) => parameters.p_bucket_key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("budgets writes more tightly than reads", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await consumePublicRequest(client(rpc), "rsvp", request());
    await consumePublicRequest(client(rpc), "guest-context", request());
    await consumePublicRequest(client(rpc), "view", request());

    const limits = rpc.mock.calls.map(([, parameters]) => parameters.p_limit);
    expect(limits[0]).toBeLessThan(limits[1]);
    expect(limits[1]).toBeLessThan(limits[2]);
  });

  it("refuses the caller once the database reports the budget is gone", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });

    await expect(consumePublicRequest(client(rpc), "rsvp", request())).resolves.toBe(false);
  });

  // A family losing their reply to an infrastructure fault is worse than an unthrottled
  // minute, and an unapplied `0019` must not take the guest lane down on deploy.
  it("fails open when the throttle itself is unavailable", async () => {
    const errored = vi.fn().mockResolvedValue({ data: null, error: { message: "missing" } });
    const threw = vi.fn().mockRejectedValue(new Error("unreachable"));

    await expect(consumePublicRequest(client(errored), "rsvp", request())).resolves.toBe(true);
    await expect(consumePublicRequest(client(threw), "rsvp", request())).resolves.toBe(true);
  });
});
