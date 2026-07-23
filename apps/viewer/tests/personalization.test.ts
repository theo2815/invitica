import { describe, expect, it } from "vitest";

import { publicIdentifierFromInvitationPath } from "../src/invitation-path";

describe("privacy-safe viewer personalization", () => {
  it("extracts only the stable invitation identifier from a valid public path", () => {
    const identifier = "0123456789abcdef0123456789abcdef";
    expect(publicIdentifierFromInvitationPath(`/i/mara-and-joaquin-${identifier}`)).toBe(
      identifier,
    );
    expect(publicIdentifierFromInvitationPath(`/i/guest-name-${identifier}/extra`)).toBeNull();
    expect(publicIdentifierFromInvitationPath(`/i/${"x".repeat(100)}-${identifier}`)).toBeNull();
  });

  it("rejects paths that do not match the public invitation contract", () => {
    const identifier = "0123456789abcdef0123456789abcdef";
    expect(publicIdentifierFromInvitationPath(`/preview/${identifier}`)).toBeNull();
    expect(publicIdentifierFromInvitationPath(`/i/event-${identifier.toUpperCase()}`)).toBeNull();
    expect(publicIdentifierFromInvitationPath("/i/event-not-an-identifier")).toBeNull();
  });
});
