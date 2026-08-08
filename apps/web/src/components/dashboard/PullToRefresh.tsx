"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState, useTransition } from "react";

import styles from "./PullToRefresh.module.css";

/** Matches the creator shell's mobile layout in `CreatorShell.module.css`. */
const MOBILE_QUERY = "(max-width: 900px)";
/** Travel required before a release refreshes, after resistance. */
const THRESHOLD_PX = 72;
/** The indicator stops descending here, so a long drag cannot push it off-screen. */
const MAX_TRAVEL_PX = 96;
/** Half the finger's movement, so the gesture resists rather than snaps open. */
const RESISTANCE = 0.5;

type PullPhase = "idle" | "pulling" | "ready" | "refreshing";

/**
 * Returns true when something between `target` and the document has already
 * scrolled, so the gesture belongs to that element rather than to the page. The
 * browser resolves this through the scroll chain; a window listener has to ask.
 */
function nestedScrollerIsScrolled(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;

  while (node && node !== document.body && node !== document.documentElement) {
    if (node.scrollTop > 0) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return true;
    }
    node = node.parentElement;
  }

  return false;
}

/**
 * Pull down from the top of a creator surface to reload it.
 *
 * Desktop has the browser's own reload control and is deliberately excluded.
 * Phones are not so uniform: Android Chrome does this natively, iOS Safari never
 * has, and the installed app has no reload button on either platform. This is a
 * pure enhancement layered over that — it suppresses the native gesture only for
 * the duration of a pull it is already handling, by cancelling the touch move, so
 * a device that never runs this script keeps whatever it had.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [distance, setDistance] = useState(0);
  const [isRefreshing, startRefresh] = useTransition();
  const distanceRef = useRef(0);

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_QUERY);
    let startY: number | null = null;

    function reset() {
      startY = null;
      distanceRef.current = 0;
      setDistance(0);
    }

    function onTouchStart(event: TouchEvent) {
      if (
        !mobile.matches ||
        event.touches.length !== 1 ||
        window.scrollY > 0 ||
        // A confirmation dialog is a decision in progress; reloading would discard it.
        document.querySelector('[role="dialog"]') !== null ||
        nestedScrollerIsScrolled(event.target)
      ) {
        startY = null;
        return;
      }

      startY = event.touches[0]?.clientY ?? null;
    }

    function onTouchMove(event: TouchEvent) {
      if (startY === null) return;

      const currentY = event.touches[0]?.clientY ?? startY;
      const delta = currentY - startY;

      // Pulling up, or the page scrolled under the finger: hand the gesture back
      // to the browser for the rest of this touch.
      if (delta <= 0 || window.scrollY > 0) {
        if (distanceRef.current > 0) reset();
        else startY = null;
        return;
      }

      // Cancelling the move is what stops Android's own pull-to-refresh and iOS's
      // rubber band from running alongside this one.
      if (event.cancelable) event.preventDefault();

      const travelled = Math.min(delta * RESISTANCE, MAX_TRAVEL_PX);
      distanceRef.current = travelled;
      setDistance(travelled);
    }

    function onTouchEnd() {
      const travelled = distanceRef.current;
      reset();

      if (travelled >= THRESHOLD_PX) {
        startRefresh(() => router.refresh());
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, [router]);

  const phase: PullPhase = isRefreshing
    ? "refreshing"
    : distance === 0
      ? "idle"
      : distance >= THRESHOLD_PX
        ? "ready"
        : "pulling";

  const label =
    phase === "refreshing"
      ? "Refreshing…"
      : phase === "ready"
        ? "Release to refresh"
        : "Pull to refresh";

  return (
    <>
      <div
        aria-hidden="true"
        className={styles.indicator}
        data-phase={phase}
        style={
          {
            "--pull-distance": `${phase === "refreshing" ? THRESHOLD_PX : distance}px`,
          } as CSSProperties
        }
      >
        <span className={styles.spinner} />
        <span className={styles.label}>{label}</span>
      </div>
      <span aria-live="polite" className={styles.visuallyHidden}>
        {isRefreshing ? "Refreshing this page…" : ""}
      </span>
    </>
  );
}
