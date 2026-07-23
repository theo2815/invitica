import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { generateGuestLinkToken, hashGuestLinkToken } from "../src/server/guests/tokens";

afterEach(() => vi.unstubAllEnvs());

describe("guest link token handling", () => {
  it("generates 256 bits of base64url token material", () => {
    vi.stubEnv("GUEST_LINK_HASH_KEY", Buffer.alloc(32, 7).toString("base64url"));
    const token = generateGuestLinkToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateGuestLinkToken()).not.toBe(token);
  });

  it("stores a keyed SHA-256 hash instead of the raw token", () => {
    const key = Buffer.alloc(32, 9);
    const token = "A".repeat(43);
    vi.stubEnv("GUEST_LINK_HASH_KEY", key.toString("base64url"));
    const hash = hashGuestLinkToken(token);

    expect(hash).toBe(createHmac("sha256", key).update(token).digest("hex"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("rejects missing or malformed secret material", () => {
    vi.stubEnv("GUEST_LINK_HASH_KEY", "short");
    expect(() => hashGuestLinkToken("A".repeat(43))).toThrow("32-byte base64url secret");
  });
});
