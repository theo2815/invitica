import { describe, expect, it } from "vitest";

import { buildIcsCalendar, formatIcsUtc, type IcsEvent } from "../src/ics.js";

describe("formatIcsUtc", () => {
  it("formats a date as an RFC 5545 UTC timestamp", () => {
    // 2027-04-11T09:00:00+08:00 is 01:00:00 UTC.
    expect(formatIcsUtc(new Date("2027-04-11T09:00:00+08:00"))).toBe("20270411T010000Z");
  });
});

describe("buildIcsCalendar", () => {
  const stamp = new Date("2026-07-25T00:00:00Z");

  const baseEvent: IcsEvent = {
    uid: "2027-04-11-new-hope@invitica",
    start: new Date("2027-04-11T09:00:00+08:00"),
    end: new Date("2027-04-11T10:00:00+08:00"),
    summary: "Christening ceremony",
    location: "New Hope Community Church, Quezon City",
    description: "Please arrive 20 minutes early.",
  };

  it("wraps events in a valid VCALENDAR envelope with UTC times", () => {
    const ics = buildIcsCalendar([baseEvent], stamp);

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:2027-04-11-new-hope@invitica");
    expect(ics).toContain("DTSTAMP:20260725T000000Z");
    expect(ics).toContain("DTSTART:20270411T010000Z");
    expect(ics).toContain("DTEND:20270411T020000Z");
    expect(ics).toContain("SUMMARY:Christening ceremony");
    // Lines are CRLF-separated per spec.
    expect(ics).toContain("\r\n");
    expect(ics).not.toContain("\n\n");
  });

  it("escapes reserved characters in text values", () => {
    const ics = buildIcsCalendar(
      [{ ...baseEvent, location: "The Sunlit Hall, Quezon City; Metro Manila" }],
      stamp,
    );

    expect(ics).toContain("LOCATION:The Sunlit Hall\\, Quezon City\\; Metro Manila");
  });

  it("omits optional location and description when absent", () => {
    const ics = buildIcsCalendar(
      [{ uid: "x", start: baseEvent.start, end: baseEvent.end, summary: "Bare" }],
      stamp,
    );

    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });
});
