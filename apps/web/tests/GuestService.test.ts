import { afterEach, describe, expect, it } from "vitest";

import {
  buildGenericInvitationUrl,
  buildPersonalizedInvitationUrl,
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
