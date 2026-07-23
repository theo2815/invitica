"use client";

import type { CSSProperties, RefObject } from "react";
import { useLayoutEffect, useState } from "react";

interface AnchoredPopoverOptions {
  estimatedHeight: number;
  minimumWidth?: number;
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
}

const VIEWPORT_GUTTER = 8;
const POPOVER_GAP = 6;

export function useAnchoredPopover({
  estimatedHeight,
  minimumWidth = 0,
  open,
  triggerRef,
}: AnchoredPopoverOptions): CSSProperties {
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const availableWidth = Math.max(0, window.innerWidth - VIEWPORT_GUTTER * 2);
      const width = Math.min(Math.max(rect.width, minimumWidth), availableWidth);
      const left = Math.min(
        Math.max(VIEWPORT_GUTTER, rect.left),
        Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER),
      );
      const opensAbove =
        window.innerHeight - rect.bottom < estimatedHeight + POPOVER_GAP &&
        rect.top > window.innerHeight - rect.bottom;
      const top = opensAbove
        ? Math.max(VIEWPORT_GUTTER, rect.top - estimatedHeight - POPOVER_GAP)
        : Math.min(
            rect.bottom + POPOVER_GAP,
            Math.max(VIEWPORT_GUTTER, window.innerHeight - VIEWPORT_GUTTER),
          );

      setPosition({
        left,
        maxHeight: `calc(100dvh - ${VIEWPORT_GUTTER * 2}px)`,
        top,
        visibility: "visible",
        width,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [estimatedHeight, minimumWidth, open, triggerRef]);

  return position;
}
