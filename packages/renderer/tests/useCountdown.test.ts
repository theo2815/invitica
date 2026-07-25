import { describe, expect, it } from "vitest";

import { countdownPartsAt } from "../src/useCountdown.js";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("countdownPartsAt", () => {
  it("breaks a future span into days, hours, minutes, and seconds", () => {
    const now = 1_000_000;
    const target = now + 2 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND;

    expect(countdownPartsAt(target, now)).toEqual({
      total: 2 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND,
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      isPast: false,
    });
  });

  it("clamps to zero and reports isPast once the target has passed", () => {
    const now = 5_000_000;

    expect(countdownPartsAt(now - SECOND, now)).toMatchObject({ total: 0, isPast: true });
    expect(countdownPartsAt(now, now)).toMatchObject({
      total: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isPast: true,
    });
  });

  it("keeps units within their ranges across a large span", () => {
    const now = 0;
    const parts = countdownPartsAt(400 * DAY + 23 * HOUR + 59 * MINUTE + 59 * SECOND, now);

    expect(parts.days).toBe(400);
    expect(parts.hours).toBe(23);
    expect(parts.minutes).toBe(59);
    expect(parts.seconds).toBe(59);
  });
});
