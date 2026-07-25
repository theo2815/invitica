"use client";

import { useEffect, useState } from "react";

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1_000;

export interface CountdownParts {
  /** Milliseconds remaining, clamped at zero once the target has passed. */
  readonly total: number;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  /** True once the target moment has been reached or passed. */
  readonly isPast: boolean;
}

/** Pure breakdown of the time between `nowMs` and `targetMs`; clamps to zero once past. */
export function countdownPartsAt(targetMs: number, nowMs: number): CountdownParts {
  const remaining = targetMs - nowMs;
  const clamped = Math.max(remaining, 0);
  return {
    total: clamped,
    days: Math.floor(clamped / MS_PER_DAY),
    hours: Math.floor((clamped % MS_PER_DAY) / MS_PER_HOUR),
    minutes: Math.floor((clamped % MS_PER_HOUR) / MS_PER_MINUTE),
    seconds: Math.floor((clamped % MS_PER_MINUTE) / MS_PER_SECOND),
    isPast: remaining <= 0,
  };
}

/**
 * Shared live countdown used by every invitation family. Returns `null` until the component has
 * hydrated so server output can render the static, always-readable date fallback first, then ticks
 * once per second on the client. Ticking pauses while the tab is hidden to save battery, and the
 * caller decides how (and whether) to animate changes so reduced-motion styling stays template-owned.
 */
export function useCountdown(targetIso: string): CountdownParts | null {
  const [parts, setParts] = useState<CountdownParts | null>(null);

  useEffect(() => {
    const target = new Date(targetIso).valueOf();
    if (Number.isNaN(target)) {
      setParts(null);
      return;
    }

    let timer = 0;
    const tick = () => setParts(countdownPartsAt(target, Date.now()));
    const start = () => {
      tick();
      timer = window.setInterval(tick, MS_PER_SECOND);
    };
    const stop = () => window.clearInterval(timer);
    const onVisibilityChange = () => {
      stop();
      if (document.visibilityState === "visible") start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [targetIso]);

  return parts;
}
