"use client";

import type {
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useRef, useState } from "react";

import type { ResolvedRendererImage } from "./InvitationRenderer.js";

const CLOSE_DURATION_MS = 160;
const SWIPE_DISTANCE_PX = 56;

export interface PhotoPreviewItem {
  readonly description?: string;
  readonly id: string;
  readonly image: ResolvedRendererImage;
  readonly label: string;
  readonly title?: string;
}

export interface PhotoPreviewTriggerProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly href: string;
  readonly label: string;
  readonly onOpen: () => void;
}

export function PhotoPreviewTrigger({
  children,
  className,
  href,
  label,
  onOpen,
}: PhotoPreviewTriggerProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.focus();
    onOpen();
  }

  return (
    <a
      aria-label={label}
      className={["ip-photo-trigger", className].filter(Boolean).join(" ")}
      href={href}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}

export function largestImageRendition(image: ResolvedRendererImage) {
  return [...image.renditions].sort((first, second) => first.width - second.width).at(-1) ?? null;
}

interface SwipeStart {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

export function PhotoPreviewDialog({
  activeIndex,
  className,
  items,
  onActiveIndexChange,
  onClose,
  reducedMotion,
}: {
  readonly activeIndex: number | null;
  readonly className?: string;
  readonly items: readonly PhotoPreviewItem[];
  readonly onActiveIndexChange: (index: number) => void;
  readonly onClose: () => void;
  readonly reducedMotion: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const previousRootOverflowRef = useRef<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFrameRef = useRef<number | null>(null);
  const swipeStartRef = useRef<SwipeStart | null>(null);
  const [renderedIndex, setRenderedIndex] = useState<number | null>(activeIndex);
  const [phase, setPhase] = useState<"closed" | "closing" | "open" | "opening">(
    activeIndex === null ? "closed" : "open",
  );
  const [zoomed, setZoomed] = useState(false);
  const displayedIndex = activeIndex ?? renderedIndex;
  const active = displayedIndex === null ? null : (items[displayedIndex] ?? null);
  const largest = active ? largestImageRendition(active.image) : null;

  function restoreRootOverflow() {
    if (previousRootOverflowRef.current === null) {
      return;
    }

    document.documentElement.style.overflow = previousRootOverflowRef.current;
    previousRootOverflowRef.current = null;
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (activeIndex !== null) {
      setRenderedIndex(activeIndex);
      setZoomed(false);

      if (dialog.open) {
        setPhase("open");
        return;
      }

      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previousRootOverflowRef.current = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      dialog.showModal();

      if (reducedMotion) {
        setPhase("open");
        closeButtonRef.current?.focus();
        return;
      }

      setPhase("opening");
      openFrameRef.current = requestAnimationFrame(() => {
        setPhase("open");
        closeButtonRef.current?.focus();
        openFrameRef.current = null;
      });
      return;
    }

    if (!dialog.open) {
      setPhase("closed");
      setRenderedIndex(null);
      return;
    }

    const finishClose = () => {
      dialog.close();
      restoreRootOverflow();
      setPhase("closed");
      setRenderedIndex(null);
      openerRef.current?.focus();
      openerRef.current = null;
      closeTimerRef.current = null;
    };

    setPhase("closing");
    if (reducedMotion) {
      finishClose();
    } else {
      closeTimerRef.current = setTimeout(finishClose, CLOSE_DURATION_MS);
    }
  }, [activeIndex, reducedMotion]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
      if (openFrameRef.current !== null) {
        cancelAnimationFrame(openFrameRef.current);
      }
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
      restoreRootOverflow();
    },
    [],
  );

  function step(direction: 1 | -1) {
    if (displayedIndex === null || items.length < 2 || zoomed) {
      return;
    }

    onActiveIndexChange((displayedIndex + direction + items.length) % items.length);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Tab") {
      const controls = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );
      const first = controls.at(0);
      const last = controls.at(-1);
      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey || zoomed) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "Home" && items.length > 1) {
      event.preventDefault();
      onActiveIndexChange(0);
    } else if (event.key === "End" && items.length > 1) {
      event.preventDefault();
      onActiveIndexChange(items.length - 1);
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (zoomed || (event.pointerType !== "touch" && event.pointerType !== "pen")) {
      return;
    }

    swipeStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId || zoomed) {
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < SWIPE_DISTANCE_PX || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) {
      return;
    }

    step(deltaX < 0 ? 1 : -1);
  }

  return (
    <dialog
      aria-label={active ? `Photo preview: ${active.label}` : "Photo preview"}
      className={["ip-photo-dialog", className].filter(Boolean).join(" ")}
      data-phase={phase}
      data-zoomed={zoomed}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
    >
      {active && largest ? (
        <div className="ip-photo-sheet">
          <header className="ip-photo-header">
            <p aria-live="polite">
              Photo {Number(displayedIndex) + 1} of {items.length}
            </p>
            <button
              aria-label="Close photo view"
              onClick={onClose}
              ref={closeButtonRef}
              type="button"
            >
              Close
            </button>
          </header>
          <div
            className="ip-photo-viewport"
            onPointerCancel={() => {
              swipeStartRef.current = null;
            }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          >
            <img
              alt=""
              className="ip-photo-image"
              decoding="async"
              height={largest.height}
              sizes={zoomed ? "192vw" : "96vw"}
              src={largest.url}
              srcSet={[...active.image.renditions]
                .sort((first, second) => first.width - second.width)
                .map((rendition) => `${rendition.url} ${rendition.width}w`)
                .join(", ")}
              width={largest.width}
            />
          </div>
          {active.title || active.description ? (
            <div className="ip-photo-caption">
              {active.title ? <strong>{active.title}</strong> : null}
              {active.description ? <span>{active.description}</span> : null}
            </div>
          ) : null}
          <footer className="ip-photo-controls">
            {items.length > 1 ? (
              <button
                aria-label="Previous photo"
                disabled={zoomed}
                onClick={() => step(-1)}
                type="button"
              >
                Previous
              </button>
            ) : null}
            <button
              aria-pressed={zoomed}
              onClick={() => setZoomed((current) => !current)}
              type="button"
            >
              {zoomed ? "Fit image" : "Zoom in"}
            </button>
            {items.length > 1 ? (
              <button
                aria-label="Next photo"
                disabled={zoomed}
                onClick={() => step(1)}
                type="button"
              >
                Next
              </button>
            ) : null}
          </footer>
        </div>
      ) : null}
    </dialog>
  );
}

export const photoPreviewStyles = `
.ip-photo-trigger { color: inherit; }
.ip-photo-dialog {
  --ip-backdrop: rgb(38 27 34 / 86%);
  --ip-surface: #fff;
  --ip-ink: #29231f;
  --ip-muted: #6d655e;
  --ip-border: rgb(41 35 31 / 30%);
  position: fixed;
  inset: 0;
  width: 100vw;
  max-width: none;
  height: 100dvh;
  max-height: none;
  margin: 0;
  padding:
    max(0.75rem, env(safe-area-inset-top))
    max(0.75rem, env(safe-area-inset-right))
    max(0.75rem, env(safe-area-inset-bottom))
    max(0.75rem, env(safe-area-inset-left));
  border: 0;
  background: transparent;
  color: var(--ip-ink);
  overflow: hidden;
}
.ip-photo-dialog[open] { display: grid; place-items: center; }
.ip-photo-dialog::backdrop {
  background: var(--ip-backdrop);
  opacity: 1;
  transition: opacity 160ms ease;
}
.ip-photo-dialog[data-phase="opening"]::backdrop,
.ip-photo-dialog[data-phase="closing"]::backdrop { opacity: 0; }
.ip-photo-sheet {
  display: grid;
  width: min(100%, 48rem);
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--ip-border);
  border-radius: 0.25rem;
  background: var(--ip-surface);
  box-shadow: 0 1.4rem 4rem rgb(0 0 0 / 28%);
  opacity: 1;
  transform: translateY(0) scale(1);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
}
.ip-photo-dialog[data-phase="opening"] .ip-photo-sheet,
.ip-photo-dialog[data-phase="closing"] .ip-photo-sheet {
  opacity: 0;
  transform: translateY(0.5rem) scale(0.985);
}
.ip-photo-header,
.ip-photo-controls {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 3.25rem;
  padding: 0.5rem clamp(0.7rem, 3vw, 1rem);
}
.ip-photo-header {
  justify-content: space-between;
  border-bottom: 1px solid var(--ip-border);
}
.ip-photo-header p {
  margin: 0;
  color: var(--ip-muted);
  font-size: 0.82rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.ip-photo-header button,
.ip-photo-controls button {
  min-height: 2.75rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--ip-border);
  border-radius: 0.2rem;
  background: var(--ip-surface);
  color: var(--ip-ink);
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
.ip-photo-header button:focus-visible,
.ip-photo-controls button:focus-visible {
  outline: 3px solid var(--ip-ink);
  outline-offset: 0.15rem;
}
.ip-photo-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
.ip-photo-viewport {
  display: grid;
  min-height: 0;
  overflow: auto;
  background: rgb(0 0 0 / 4%);
  overscroll-behavior: contain;
  place-items: center;
  touch-action: pan-y pinch-zoom;
}
.ip-photo-image {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: min(68dvh, 46rem);
  object-fit: contain;
  transition: max-width 160ms ease;
  user-select: none;
  -webkit-user-drag: none;
}
.ip-photo-dialog[data-zoomed="true"] .ip-photo-viewport {
  display: block;
  cursor: zoom-out;
  touch-action: pan-x pan-y pinch-zoom;
}
.ip-photo-dialog[data-zoomed="true"] .ip-photo-image {
  width: 200%;
  max-width: none;
  max-height: none;
  margin: auto;
}
.ip-photo-caption {
  display: grid;
  gap: 0.2rem;
  padding: 0.7rem clamp(0.8rem, 3vw, 1.1rem);
  border-top: 1px solid var(--ip-border);
}
.ip-photo-caption strong,
.ip-photo-caption span { display: block; }
.ip-photo-caption span {
  color: var(--ip-muted);
  font-size: 0.92rem;
}
.ip-photo-controls {
  justify-content: center;
  border-top: 1px solid var(--ip-border);
}
@media (max-width: 32rem) {
  .ip-photo-dialog {
    padding:
      max(0.4rem, env(safe-area-inset-top))
      max(0.4rem, env(safe-area-inset-right))
      max(0.4rem, env(safe-area-inset-bottom))
      max(0.4rem, env(safe-area-inset-left));
  }
  .ip-photo-sheet { width: 100%; }
  .ip-photo-header,
  .ip-photo-controls { min-height: 3rem; }
  .ip-photo-controls button { flex: 1 1 0; }
  .ip-photo-image { max-height: 62dvh; }
}
@media (prefers-reduced-motion: reduce) {
  .ip-photo-dialog::backdrop,
  .ip-photo-sheet,
  .ip-photo-image { transition: none; }
}
`;
