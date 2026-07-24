"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import type { InvitationRendererProps } from "./InvitationRenderer.js";

export type InvitationOpeningState =
  | "closed"
  | "untying"
  | "opening"
  | "letter-revealing"
  | "opened";

export type RibbonEnvelopeVariant =
  | "garden-promise"
  | "golden-hour"
  | "little-blessings"
  | "sunday-joy"
  | "warm-editorial";

const standardPhaseDurations: Partial<Record<InvitationOpeningState, number>> = {
  untying: 620,
  opening: 700,
  "letter-revealing": 760,
};

const gardenPromisePhaseDurations: Partial<Record<InvitationOpeningState, number>> = {
  untying: 900,
  opening: 1_050,
  "letter-revealing": 1_400,
};

const nextPhase: Partial<Record<InvitationOpeningState, InvitationOpeningState>> = {
  untying: "opening",
  opening: "letter-revealing",
  "letter-revealing": "opened",
};

const standardSafetyTimeout = 3_200;
const gardenPromiseSafetyTimeout = 5_200;

function usePrefersReducedMotion(reducedMotion: boolean): boolean {
  const [systemPreference, setSystemPreference] = useState(false);

  useEffect(() => {
    if (reducedMotion || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setSystemPreference(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, [reducedMotion]);

  return reducedMotion || systemPreference;
}

interface RibbonEnvelopeOpeningProps {
  children: ReactNode;
  className?: string | undefined;
  includeStyles?: boolean;
  kicker: string;
  letterLead: string;
  letterNote: string;
  mode: InvitationRendererProps["mode"];
  onOpeningStateChange?: ((state: InvitationOpeningState) => void) | undefined;
  openingReplayKey?: number | undefined;
  recipient: string;
  recipientLead: string;
  reducedMotion?: boolean;
  sceneDecoration?: ReactNode;
  style?: CSSProperties;
  variant: RibbonEnvelopeVariant;
}

function gardenClass(className: string, gardenPromise: boolean): string {
  return gardenPromise ? `ie-${className} gp-${className}` : `ie-${className}`;
}

export function RibbonEnvelopeOpening({
  children,
  className,
  includeStyles = true,
  kicker,
  letterLead,
  letterNote,
  mode,
  onOpeningStateChange,
  openingReplayKey = 0,
  recipient,
  recipientLead,
  reducedMotion = false,
  sceneDecoration,
  style,
  variant,
}: RibbonEnvelopeOpeningProps) {
  const [hydrated, setHydrated] = useState(false);
  const [openingState, setOpeningState] = useState<InvitationOpeningState>("closed");
  const shouldReduceMotion = usePrefersReducedMotion(reducedMotion);
  const invitationContentId = useId();
  const openingHeadingId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const activatedRef = useRef(false);
  const replayKeyRef = useRef(openingReplayKey);
  const sequenceActive = openingState !== "closed" && openingState !== "opened";
  const contentIsGated = hydrated && openingState !== "opened";
  const shouldLockPage = contentIsGated && mode === "published";
  const gardenPromise = variant === "garden-promise";
  const cinematicTakeover =
    gardenPromise ||
    variant === "golden-hour" ||
    variant === "little-blessings" ||
    variant === "sunday-joy";
  const contentIsVisuallyGated =
    contentIsGated && !(cinematicTakeover && openingState === "letter-revealing");

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    onOpeningStateChange?.(openingState);
  }, [onOpeningStateChange, openingState]);

  useEffect(() => {
    if (replayKeyRef.current === openingReplayKey) return;

    replayKeyRef.current = openingReplayKey;
    activatedRef.current = false;
    setOpeningState("closed");
    const timer = window.setTimeout(() => openerRef.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, [openingReplayKey]);

  useEffect(() => {
    const durations = gardenPromise ? gardenPromisePhaseDurations : standardPhaseDurations;
    const duration = durations[openingState];
    const followingState = nextPhase[openingState];
    if (!duration || !followingState) return;

    const timer = window.setTimeout(() => setOpeningState(followingState), duration);
    return () => window.clearTimeout(timer);
  }, [gardenPromise, openingState]);

  useEffect(() => {
    if (!sequenceActive) return;

    const timeout = gardenPromise ? gardenPromiseSafetyTimeout : standardSafetyTimeout;
    const timer = window.setTimeout(() => setOpeningState("opened"), timeout);
    return () => window.clearTimeout(timer);
  }, [gardenPromise, sequenceActive]);

  useEffect(() => {
    if (shouldReduceMotion && sequenceActive) setOpeningState("opened");
  }, [sequenceActive, shouldReduceMotion]);

  useEffect(() => {
    if (!shouldLockPage) return;

    const root = document.documentElement;
    const body = document.body;
    const previousLock = root.getAttribute("data-invitation-scroll-lock");
    const previous = {
      bodyLeft: body.style.left,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyRight: body.style.right,
      bodyTop: body.style.top,
      bodyTouchAction: body.style.touchAction,
      bodyWidth: body.style.width,
      rootOverflow: root.style.overflow,
      rootScrollbarGutter: root.style.scrollbarGutter,
    };
    const keepAtInvitationStart = () => {
      if (window.scrollY !== 0) window.scrollTo({ behavior: "auto", left: 0, top: 0 });
    };

    keepAtInvitationStart();
    root.setAttribute("data-invitation-scroll-lock", "true");
    root.style.overflow = "hidden";
    root.style.scrollbarGutter = "auto";
    body.style.position = "fixed";
    body.style.top = "0";
    body.style.right = "0";
    body.style.left = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    window.addEventListener("scroll", keepAtInvitationStart, { passive: true });

    return () => {
      window.removeEventListener("scroll", keepAtInvitationStart);
      root.style.overflow = previous.rootOverflow;
      root.style.scrollbarGutter = previous.rootScrollbarGutter;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.right = previous.bodyRight;
      body.style.left = previous.bodyLeft;
      body.style.width = previous.bodyWidth;
      body.style.overflow = previous.bodyOverflow;
      body.style.touchAction = previous.bodyTouchAction;
      if (previousLock === null) root.removeAttribute("data-invitation-scroll-lock");
      else root.setAttribute("data-invitation-scroll-lock", previousLock);
      if (window.scrollY !== 0) window.scrollTo({ behavior: "auto", left: 0, top: 0 });
    };
  }, [shouldLockPage]);

  useEffect(() => {
    if (openingState !== "opened" || !activatedRef.current) return;

    const timer = window.setTimeout(
      () => {
        const focusTarget = contentRef.current?.querySelector<HTMLElement>(
          "[data-envelope-focus-target]",
        );
        focusTarget?.focus({ preventScroll: true });
      },
      shouldReduceMotion ? 50 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [openingState, shouldReduceMotion]);

  function openInvitation() {
    if (openingState !== "closed") return;

    activatedRef.current = true;
    setOpeningState(shouldReduceMotion ? "opened" : "untying");
  }

  function skipOpening() {
    if (!sequenceActive) return;

    setOpeningState("opened");
  }

  const status =
    openingState === "closed"
      ? "Invitation closed"
      : openingState === "opened"
        ? "Invitation opened"
        : "Opening invitation";
  const openerLabel =
    openingState === "closed"
      ? `Open invitation for ${recipient}`
      : openingState === "opened"
        ? `Invitation for ${recipient} opened`
        : `Opening invitation for ${recipient}`;

  return (
    <div
      className={`ie-root${className ? ` ${className}` : ""}`}
      data-envelope-hydrated={hydrated}
      data-envelope-takeover={cinematicTakeover}
      data-envelope-variant={variant}
      data-motion-enabled={!shouldReduceMotion}
      data-opening-state={openingState}
      style={style}
    >
      {includeStyles ? <style>{ribbonEnvelopeStyles}</style> : null}
      <section
        aria-labelledby={openingHeadingId}
        className={gardenClass("opening", gardenPromise)}
        data-envelope-opening="true"
        hidden={cinematicTakeover && openingState === "opened"}
      >
        <h2 className={gardenClass("visually-hidden", gardenPromise)} id={openingHeadingId}>
          Invitation for {recipient}
        </h2>
        <p className={gardenClass("opening-kicker", gardenPromise)}>{kicker}</p>

        <button
          aria-controls={invitationContentId}
          aria-disabled={openingState !== "closed"}
          aria-expanded={openingState === "opened"}
          aria-label={openerLabel}
          className={gardenClass("scene", gardenPromise)}
          onClick={openInvitation}
          ref={openerRef}
          type="button"
        >
          {sceneDecoration}
          <div aria-hidden="true" className={gardenClass("envelope", gardenPromise)}>
            <div className={gardenClass("envelope-back", gardenPromise)} />
            <div className={gardenClass("letter", gardenPromise)}>
              <span>{letterLead}</span>
              <strong>{recipient}</strong>
              <small>{letterNote}</small>
            </div>
            <div className={gardenClass("envelope-flap", gardenPromise)} />
            <div className={gardenClass("envelope-front", gardenPromise)} />
            <div className={gardenClass("address", gardenPromise)}>
              <span>For</span>
              <strong>{recipient}</strong>
            </div>
            <div
              className={`${gardenClass("ribbon", gardenPromise)} ${gardenClass(
                "ribbon-horizontal",
                gardenPromise,
              )}`}
            />
            <div
              className={`${gardenClass("ribbon", gardenPromise)} ${gardenClass(
                "ribbon-vertical",
                gardenPromise,
              )}`}
            />
            <div className={gardenClass("ribbon-knot", gardenPromise)}>
              <span
                className={`${gardenClass("ribbon-loop", gardenPromise)} ${gardenClass(
                  "ribbon-loop-left",
                  gardenPromise,
                )}`}
              />
              <span
                className={`${gardenClass("ribbon-loop", gardenPromise)} ${gardenClass(
                  "ribbon-loop-right",
                  gardenPromise,
                )}`}
              />
              <span
                className={`${gardenClass("ribbon-tail", gardenPromise)} ${gardenClass(
                  "ribbon-tail-left",
                  gardenPromise,
                )}`}
              />
              <span
                className={`${gardenClass("ribbon-tail", gardenPromise)} ${gardenClass(
                  "ribbon-tail-right",
                  gardenPromise,
                )}`}
              />
              <i />
            </div>
          </div>
        </button>

        <p className={gardenClass("recipient-line", gardenPromise)}>
          {recipientLead}
          <strong>{recipient}</strong>
        </p>
        <p aria-hidden="true" className={gardenClass("opening-hint", gardenPromise)}>
          {openingState === "closed"
            ? "Tap the invitation card to open"
            : openingState === "opened"
              ? "Your invitation is open"
              : "Opening invitation…"}
        </p>
        {gardenPromise && sequenceActive ? (
          <button
            className={gardenClass("skip-opening", gardenPromise)}
            onClick={skipOpening}
            type="button"
          >
            Skip opening
          </button>
        ) : null}
        <span
          aria-live="polite"
          className={gardenClass("visually-hidden", gardenPromise)}
          id={`${openingHeadingId}-status`}
        >
          {status}
        </span>
      </section>

      <div
        className="ie-content"
        data-envelope-gated={contentIsGated}
        data-envelope-visual-gated={contentIsVisuallyGated}
        id={invitationContentId}
        inert={contentIsGated}
        ref={contentRef}
      >
        {children}
      </div>
    </div>
  );
}

export const ribbonEnvelopeStyles = `
.ie-root {
  position: relative;
  container-type: inline-size;
  width: 100%;
  min-width: 0;
  color: var(--ie-ink);
}
.ie-opening[hidden] { display: none; }
.ie-root *,
.ie-root *::before,
.ie-root *::after { box-sizing: border-box; }
.ie-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
.ie-opening {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: clamp(35rem, 90svh, 48rem);
  padding: clamp(2rem, 8cqi, 5rem) clamp(1rem, 6cqi, 4rem);
  overflow: hidden;
  text-align: center;
  place-items: center;
  align-content: center;
}
.ie-opening::before {
  position: absolute;
  inset: clamp(0.8rem, 2cqi, 1.5rem);
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 32%, transparent);
  content: "";
  pointer-events: none;
}
.ie-opening-kicker {
  margin: 0;
  color: var(--ie-ribbon);
  font-size: 0.68rem;
  font-weight: 760;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.ie-scene {
  position: relative;
  display: grid;
  appearance: none;
  width: min(100%, 34rem);
  min-width: 0;
  max-width: 100%;
  min-height: clamp(18rem, 62cqi, 24rem);
  margin-block: clamp(1.6rem, 5cqi, 2.8rem) 1rem;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  perspective: 70rem;
  place-items: center;
}
.ie-scene[aria-disabled="true"] { cursor: default; }
.ie-scene:focus-visible {
  outline: 3px solid var(--ie-ink);
  outline-offset: 0.45rem;
}
.ie-envelope {
  position: relative;
  z-index: 1;
  width: min(84%, 26rem);
  min-width: 0;
  max-width: 100%;
  aspect-ratio: 1.48;
  transform-style: preserve-3d;
  transition: transform 300ms cubic-bezier(0.2, 0.75, 0.2, 1);
}
.ie-scene:hover:not([aria-disabled="true"]) .ie-envelope {
  transform: translateY(-0.3rem) scale(1.01);
}
.ie-envelope-back,
.ie-envelope-front,
.ie-envelope-flap {
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 25%, transparent);
  background: color-mix(in srgb, var(--ie-paper) 90%, var(--ie-background));
}
.ie-envelope-back {
  z-index: 1;
  box-shadow: 0 1.7rem 1.5rem color-mix(in srgb, var(--ie-ink) 20%, transparent);
}
.ie-envelope-front {
  z-index: 5;
  clip-path: polygon(0 0, 50% 58%, 100% 0, 100% 100%, 0 100%);
  background:
    linear-gradient(31deg, transparent 49.5%, color-mix(in srgb, var(--ie-ink) 10%, transparent) 50%, transparent 50.5%),
    linear-gradient(-31deg, transparent 49.5%, color-mix(in srgb, var(--ie-ink) 10%, transparent) 50%, transparent 50.5%),
    color-mix(in srgb, var(--ie-paper) 94%, var(--ie-background));
}
.ie-envelope-flap {
  z-index: 6;
  clip-path: polygon(0 0, 100% 0, 50% 63%);
  transform-origin: 50% 0;
  backface-visibility: hidden;
  transition:
    opacity 420ms ease,
    transform 680ms cubic-bezier(0.65, 0, 0.25, 1);
}
.ie-letter {
  position: absolute;
  z-index: 3;
  inset: 5% 7% 8%;
  display: grid;
  min-width: 0;
  align-content: center;
  padding: 12% 9%;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 24%, transparent);
  background: linear-gradient(rgb(255 255 255 / 45%), transparent), var(--ie-paper);
  text-align: center;
  transform: translateY(22%);
  transition: transform 740ms cubic-bezier(0.2, 0.75, 0.2, 1);
}
.ie-letter span,
.ie-letter small,
.ie-address span {
  font-size: clamp(0.48rem, 1.6cqi, 0.65rem);
  font-weight: 720;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.ie-letter strong {
  overflow-wrap: anywhere;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.15rem, 5cqi, 2rem);
  font-weight: 480;
  line-height: 1.08;
}
.ie-letter small {
  margin-top: 0.7rem;
  color: color-mix(in srgb, var(--ie-ink) 66%, transparent);
  letter-spacing: 0.08em;
}
.ie-address {
  position: absolute;
  z-index: 7;
  inset: 14% 12% auto;
  display: grid;
  gap: 0.35rem;
  text-align: center;
  transition: opacity 220ms ease;
}
.ie-address strong {
  overflow-wrap: anywhere;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(0.86rem, 3.8cqi, 1.45rem);
  font-weight: 500;
  line-height: 1;
}
.ie-ribbon {
  position: absolute;
  z-index: 8;
  background: var(--ie-ribbon);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 14%);
  transition:
    opacity 280ms ease 120ms,
    transform 620ms cubic-bezier(0.4, 0, 0.2, 1);
}
.ie-ribbon-horizontal {
  top: 45%;
  right: -3%;
  left: -3%;
  height: 12%;
}
.ie-ribbon-vertical {
  top: -5%;
  bottom: -5%;
  left: 45.5%;
  width: 9%;
}
.ie-ribbon-knot {
  position: absolute;
  z-index: 9;
  top: 42%;
  left: 50%;
  width: 2.5rem;
  height: 2.5rem;
  color: var(--ie-ribbon);
  transform: translate(-50%, -35%);
  transition:
    opacity 260ms ease 180ms,
    transform 620ms cubic-bezier(0.4, 0, 0.2, 1);
}
.ie-ribbon-loop,
.ie-ribbon-tail,
.ie-ribbon-knot i {
  position: absolute;
  display: block;
  transition: transform 520ms cubic-bezier(0.2, 0.72, 0.24, 1), opacity 260ms ease;
}
.ie-ribbon-loop {
  top: 0.35rem;
  width: 1.7rem;
  height: 1.2rem;
  border: 0.45rem solid currentColor;
  border-radius: 50% 50% 45% 55%;
}
.ie-ribbon-loop-left { right: 1.15rem; transform: rotate(18deg); }
.ie-ribbon-loop-right { left: 1.15rem; transform: scaleX(-1) rotate(18deg); }
.ie-ribbon-tail {
  top: 1.35rem;
  width: 0.52rem;
  height: 2.2rem;
  background: currentColor;
  transform-origin: 50% 0;
}
.ie-ribbon-tail-left { left: 0.72rem; transform: rotate(24deg); }
.ie-ribbon-tail-right { right: 0.72rem; transform: rotate(-24deg); }
.ie-ribbon-knot i {
  inset: 0.7rem;
  border-radius: 50%;
  background: currentColor;
}
.ie-root[data-opening-state="untying"] .ie-envelope { transform: scale(0.99); }
.ie-root[data-opening-state="untying"] .ie-ribbon-horizontal { transform: translateX(-3%) scaleX(0.94); }
.ie-root[data-opening-state="untying"] .ie-ribbon-vertical { transform: translateY(3%) scaleY(0.92); }
.ie-root[data-opening-state="untying"] .ie-ribbon-loop-left { transform: translate(-38%, 16%) rotate(-12deg) scale(1.08); }
.ie-root[data-opening-state="untying"] .ie-ribbon-loop-right { transform: translate(44%, 8%) scaleX(-1) rotate(-6deg) scale(1.12); }
.ie-root[data-opening-state="untying"] .ie-ribbon-tail-left { transform: translate(-24%, 18%) rotate(38deg); }
.ie-root[data-opening-state="untying"] .ie-ribbon-tail-right { transform: translate(32%, 12%) rotate(-44deg); }
.ie-root[data-opening-state="untying"] .ie-ribbon-knot i { opacity: 0.72; transform: scale(0.82); }
.ie-root[data-opening-state="opening"] .ie-ribbon-horizontal,
.ie-root[data-opening-state="letter-revealing"] .ie-ribbon-horizontal,
.ie-root[data-opening-state="opened"] .ie-ribbon-horizontal {
  opacity: 0;
  transform: translateX(-68%);
}
.ie-root[data-opening-state="opening"] .ie-ribbon-vertical,
.ie-root[data-opening-state="letter-revealing"] .ie-ribbon-vertical,
.ie-root[data-opening-state="opened"] .ie-ribbon-vertical {
  opacity: 0;
  transform: translateY(-68%);
}
.ie-root[data-opening-state="opening"] .ie-ribbon-knot,
.ie-root[data-opening-state="letter-revealing"] .ie-ribbon-knot,
.ie-root[data-opening-state="opened"] .ie-ribbon-knot {
  opacity: 0;
  transform: translate(-50%, 45%) rotate(18deg) scale(0.86);
}
.ie-root[data-opening-state="opening"] .ie-envelope-flap,
.ie-root[data-opening-state="letter-revealing"] .ie-envelope-flap,
.ie-root[data-opening-state="opened"] .ie-envelope-flap {
  z-index: 2;
  opacity: 0.72;
  transform: rotateX(178deg);
}
.ie-root[data-opening-state="opening"] .ie-address,
.ie-root[data-opening-state="letter-revealing"] .ie-address,
.ie-root[data-opening-state="opened"] .ie-address { opacity: 0; }
.ie-root[data-opening-state="letter-revealing"] .ie-letter,
.ie-root[data-opening-state="opened"] .ie-letter {
  z-index: 7;
  transform: translateY(-46%);
}
.ie-recipient-line {
  width: min(100%, 28rem);
  max-width: 28rem;
  margin: 0;
  padding-inline: 1rem;
  color: color-mix(in srgb, var(--ie-ink) 72%, transparent);
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(0.95rem, 3cqi, 1.2rem);
}
.ie-recipient-line strong {
  display: block;
  margin-top: 0.18rem;
  overflow-wrap: anywhere;
  color: var(--ie-ink);
  font-weight: 560;
}
.ie-opening-hint {
  margin: 0.7rem 0 0;
  color: color-mix(in srgb, var(--ie-ribbon) 88%, var(--ie-ink));
  font-size: 0.72rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ie-content[data-envelope-visual-gated="true"] {
  height: 0;
  overflow: clip;
  visibility: hidden;
}
.ie-content[data-envelope-visual-gated="false"] { animation: ie-content-arrive 360ms ease-out both; }
.ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-opening {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
}
.ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-opening::before,
.ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-opening-kicker,
.ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-recipient-line,
.ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-opening-hint {
  opacity: 0;
}
.ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-envelope-back,
.ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-envelope-front {
  opacity: 0;
  transform: translateY(8%) scale(0.95);
}
.ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-envelope-flap {
  opacity: 0;
}
.ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-letter {
  opacity: 0;
  transform: translateY(-34%) scale(1.12);
}
.ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-content {
  animation: ie-content-takeover 760ms ease-out both;
}
.ie-root[data-envelope-takeover="true"][data-opening-state="opened"] .ie-content {
  animation: none;
}
.ie-root[data-envelope-variant="golden-hour"] .ie-opening::after {
  position: absolute;
  width: min(64cqi, 19rem);
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 34%, transparent);
  content: "";
  pointer-events: none;
  transform: rotate(45deg);
}
.ie-root[data-envelope-variant="golden-hour"] .ie-envelope { transform: rotate(-1deg); }
.ie-root[data-envelope-variant="golden-hour"] .ie-letter,
.ie-root[data-envelope-variant="golden-hour"] .ie-envelope-front { border-radius: 0; }
.ie-root[data-envelope-variant="sunday-joy"] .ie-opening::after {
  position: absolute;
  top: 8%;
  right: -2.5rem;
  width: 8rem;
  aspect-ratio: 1;
  border: 1.25rem solid color-mix(in srgb, var(--ie-ribbon) 72%, transparent);
  border-radius: 50%;
  content: "";
  pointer-events: none;
}
.ie-root[data-envelope-variant="sunday-joy"] .ie-envelope { transform: rotate(1.5deg); }
.ie-root[data-envelope-variant="sunday-joy"] .ie-letter { border-radius: 0.4rem; }
.ie-root[data-envelope-variant="sunday-joy"] .ie-ribbon-horizontal { transform: rotate(-2deg); }
.ie-root[data-envelope-variant="warm-editorial"] .ie-opening { min-height: clamp(25rem, 68svh, 36rem); }
.ie-root[data-envelope-variant="warm-editorial"] .ie-opening::before { border-style: dashed; }
.sr-root[data-render-mode="published"] .ie-opening {
  min-height: 100svh;
}
@keyframes ie-content-arrive {
  from { opacity: 0; transform: translateY(0.55rem); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ie-content-takeover {
  0%, 36% { opacity: 0; transform: translateY(0.65rem); }
  100% { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .ie-root *,
  .ie-root *::before,
  .ie-root *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
