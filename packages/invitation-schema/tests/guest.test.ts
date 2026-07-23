import { describe, expect, it } from "vitest";

import {
  GUEST_LINK_FRAGMENT_KEY,
  guestContextRequestSchema,
  guestContextResponseSchema,
  guestLinkTokenSchema,
  guestRsvpMutationRequestSchema,
  guestRsvpMutationResponseSchema,
} from "../src/index.js";

describe("guest link contracts", () => {
  const token = "A".repeat(43);

  it("accepts only fixed-length base64url guest tokens", () => {
    expect(guestLinkTokenSchema.parse(token)).toBe(token);
    expect(guestLinkTokenSchema.safeParse("short").success).toBe(false);
    expect(guestLinkTokenSchema.safeParse(`${"A".repeat(42)}+`).success).toBe(false);
  });

  it("binds guest resolution to a public invitation identifier", () => {
    expect(
      guestContextRequestSchema.parse({
        publicIdentifier: "0123456789abcdef0123456789abcdef",
        token,
      }),
    ).toEqual({ publicIdentifier: "0123456789abcdef0123456789abcdef", token });
    expect(
      guestContextRequestSchema.safeParse({
        publicIdentifier: "0123456789abcdef0123456789abcdef",
        token,
        recipientName: "Private name",
      }).success,
    ).toBe(false);
  });

  it("returns a bounded recipient greeting and RSVP context", () => {
    const response = {
      recipientName: "Tita Lena and family",
      rsvp: { capacity: 4, deadline: null, response: null, status: "open" as const },
    };
    expect(guestContextResponseSchema.parse(response)).toEqual(response);
    expect(
      guestContextResponseSchema.safeParse({ ...response, privateLabel: "Santos" }).success,
    ).toBe(false);
    expect(GUEST_LINK_FRAGMENT_KEY).toBe("g");
  });

  it("validates retry-safe RSVP attendance and party size", () => {
    const base = {
      expectedRevision: 0,
      mutationId: "10000000-0000-4000-8000-000000000001",
      publicIdentifier: "0123456789abcdef0123456789abcdef",
      token,
    };
    expect(
      guestRsvpMutationRequestSchema.safeParse({
        ...base,
        attendance: "attending",
        attendeeCount: 3,
      }).success,
    ).toBe(true);
    expect(
      guestRsvpMutationRequestSchema.safeParse({
        ...base,
        attendance: "attending",
        attendeeCount: 0,
      }).success,
    ).toBe(false);
  });

  it("keeps persisted RSVP responses minimal and revisioned", () => {
    const response = {
      response: {
        attendance: "declined" as const,
        attendeeCount: 0,
        message: null,
        revision: 2,
        updatedAt: "2026-07-23T10:00:00+08:00",
      },
    };
    expect(guestRsvpMutationResponseSchema.parse(response)).toEqual(response);
    expect(
      guestRsvpMutationResponseSchema.safeParse({
        ...response,
        guestEmail: "private@example.invalid",
      }).success,
    ).toBe(false);
  });
});
