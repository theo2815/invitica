"use client";

import type { InvitationSection } from "@invitica/invitation-schema";
import type { CSSProperties, ReactElement } from "react";

import type { InvitationRendererProps } from "./InvitationRenderer.js";

import { RibbonEnvelopeOpening, ribbonEnvelopeStyles } from "./RibbonEnvelopeOpening.js";

function BotanicalSprig({ side }: { side: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      className={`gp-sprig gp-sprig-${side}`}
      focusable="false"
      viewBox="0 0 120 240"
    >
      <path d="M62 226C58 172 68 113 52 20" />
      <path d="M59 183C34 168 22 145 19 121C42 126 57 144 59 183Z" />
      <path d="M62 151C83 134 92 111 89 88C69 98 59 120 62 151Z" />
      <path d="M57 111C35 98 24 79 22 58C43 63 56 82 57 111Z" />
      <path d="M55 73C72 58 78 40 75 22C59 31 52 48 55 73Z" />
      <circle cx="20" cy="117" r="3" />
      <circle cx="90" cy="84" r="3" />
    </svg>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Garden Promise section: ${JSON.stringify(value)}`);
}

function formatRsvpDeadline(deadline: string, locale: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone,
    }).format(new Date(deadline));
  } catch {
    return deadline.slice(0, 10);
  }
}

function renderGardenSection(
  section: InvitationSection,
  locale: string,
  mode: InvitationRendererProps["mode"],
  rsvpSlot: InvitationRendererProps["rsvpSlot"],
  timeZone: string,
): ReactElement {
  switch (section.type) {
    case "hero":
      return (
        <section
          className="gp-section gp-hero"
          data-animation={section.animationPreset}
          key={section.id}
        >
          <BotanicalSprig side="left" />
          <BotanicalSprig side="right" />
          {section.props.eyebrow ? <p className="gp-eyebrow">{section.props.eyebrow}</p> : null}
          <h1>{section.props.title}</h1>
          {section.props.subtitle ? <p className="gp-hero-copy">{section.props.subtitle}</p> : null}
          {section.props.dateLabel ? <time>{section.props.dateLabel}</time> : null}
        </section>
      );

    case "message":
      return (
        <section
          className="gp-section gp-message"
          data-animation={section.animationPreset}
          key={section.id}
        >
          <div className="gp-section-number" aria-hidden="true">
            I
          </div>
          <div>
            {section.props.heading ? <h2>{section.props.heading}</h2> : null}
            <p>{section.props.body}</p>
          </div>
        </section>
      );

    case "venue":
      return (
        <section
          className="gp-section gp-venue"
          data-animation={section.animationPreset}
          key={section.id}
        >
          <p className="gp-eyebrow">Where we gather</p>
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <h3>{section.props.venueName}</h3>
          <address>{section.props.address}</address>
          {section.props.mapUrl ? (
            <a href={section.props.mapUrl} rel="noreferrer" target="_blank">
              View location
            </a>
          ) : null}
        </section>
      );

    case "rsvp":
      return (
        <section
          className="gp-section gp-rsvp"
          data-animation={section.animationPreset}
          key={section.id}
        >
          <div className="gp-rsvp-rule" aria-hidden="true" />
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          {section.props.message ? <p>{section.props.message}</p> : null}
          {section.props.deadline ? (
            <time dateTime={section.props.deadline}>
              Kindly reply by {formatRsvpDeadline(section.props.deadline, locale, timeZone)}
            </time>
          ) : null}
          <div data-rsvp-slot="true">
            {rsvpSlot ?? (
              <span>
                {mode === "preview"
                  ? "Response form available after publication"
                  : "Use your personalized invitation link to respond"}
              </span>
            )}
          </div>
        </section>
      );

    default:
      return assertNever(section);
  }
}

export function GardenPromiseRenderer({
  document,
  mode,
  onOpeningStateChange,
  openingReplayKey,
  recipientName,
  reducedMotion = false,
  rsvpSlot,
}: InvitationRendererProps) {
  const recipient = recipientName ?? document.opening.fallbackRecipientText;
  const style = {
    "--gp-background": document.theme.colors.background,
    "--gp-paper": document.theme.colors.surface,
    "--gp-ink": document.theme.colors.text,
    "--gp-sage": document.theme.colors.accent,
    "--gp-sage-contrast": document.theme.colors.accentContrast,
    "--ie-background": document.theme.colors.background,
    "--ie-paper": document.theme.colors.surface,
    "--ie-ink": document.theme.colors.text,
    "--ie-ribbon": document.theme.colors.accent,
  } as CSSProperties;

  return (
    <article
      className="gp-root"
      data-invitation-schema-version={document.schemaVersion}
      data-render-mode={mode}
      lang={document.locale}
      style={style}
    >
      <style>{`${ribbonEnvelopeStyles}\n${gardenPromiseStyles}`}</style>
      <RibbonEnvelopeOpening
        includeStyles={false}
        kicker="A promise is waiting"
        letterLead="Dear"
        letterNote="We saved you a place"
        mode={mode}
        onOpeningStateChange={onOpeningStateChange}
        openingReplayKey={openingReplayKey}
        recipient={recipient}
        recipientLead="Prepared with care for"
        reducedMotion={reducedMotion}
        sceneDecoration={
          <>
            <BotanicalSprig side="left" />
            <BotanicalSprig side="right" />
          </>
        }
        variant="garden-promise"
      >
        <main className="gp-content" data-envelope-focus-target tabIndex={-1}>
          {document.sections
            .filter((section) => section.visible)
            .map((section) =>
              renderGardenSection(section, document.locale, mode, rsvpSlot, document.eventTimezone),
            )}
        </main>
        <footer className="gp-footer">
          <BotanicalSprig side="left" />
          <p>With love, always</p>
        </footer>
      </RibbonEnvelopeOpening>
    </article>
  );
}
const gardenPromiseStyles = `
.gp-root {
  container-type: inline-size;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: clip;
  isolation: isolate;
  background:
    radial-gradient(circle at 20% 10%, rgb(255 255 255 / 44%), transparent 24rem),
    linear-gradient(135deg, rgb(255 255 255 / 10%), transparent 45%),
    var(--gp-background);
  color: var(--gp-ink);
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
  font-synthesis: none;
  line-height: 1.5;
}

.gp-root *,
.gp-root *::before,
.gp-root *::after {
  box-sizing: border-box;
}

.gp-root .ie-root {
  position: relative;
}

.gp-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.gp-opening {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: clamp(37rem, 100svh, 52rem);
  padding: clamp(2rem, 8cqi, 5rem) clamp(1rem, 6cqi, 4rem);
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 42%, rgb(255 255 255 / 38%), transparent 19rem),
    linear-gradient(180deg, rgb(255 255 255 / 12%), transparent 58%);
  text-align: center;
  place-items: center;
  align-content: center;
}

.gp-opening[hidden] {
  display: none;
}

.gp-opening::before {
  position: absolute;
  inset: clamp(0.8rem, 2cqi, 1.5rem);
  border: 1px solid color-mix(in srgb, var(--gp-sage) 32%, transparent);
  content: "";
  pointer-events: none;
  transition: opacity 420ms ease;
}

.gp-opening-kicker,
.gp-eyebrow {
  margin: 0;
  color: var(--gp-sage);
  font-size: 0.68rem;
  font-weight: 760;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  transition: opacity 320ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.gp-scene {
  position: relative;
  display: grid;
  appearance: none;
  width: min(100%, 34rem);
  min-width: 0;
  max-width: 100%;
  min-height: clamp(19rem, 68cqi, 26rem);
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
.gp-scene[aria-disabled="true"] {
  cursor: default;
}
.gp-scene:focus-visible {
  outline: 3px solid var(--gp-ink);
  outline-offset: 0.45rem;
}

.gp-sprig {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.15;
}

.gp-scene > .gp-sprig {
  position: absolute;
  z-index: 0;
  width: clamp(5rem, 17cqi, 8rem);
  color: color-mix(in srgb, var(--gp-sage) 72%, transparent);
  opacity: 0.58;
  transition: opacity 420ms ease, transform 620ms cubic-bezier(0.22, 1, 0.36, 1);
}

.gp-scene > .gp-sprig-left {
  bottom: 4%;
  left: -2%;
  transform: rotate(-22deg);
}

.gp-scene > .gp-sprig-right {
  top: 2%;
  right: -1%;
  transform: scaleX(-1) rotate(-19deg);
}

.gp-envelope {
  position: relative;
  z-index: 1;
  width: min(86%, 28rem);
  min-width: 0;
  max-width: 100%;
  aspect-ratio: 1.5;
  transform-style: preserve-3d;
  transition: transform 440ms cubic-bezier(0.22, 1, 0.36, 1);
}
.gp-scene:hover:not([aria-disabled="true"]) .gp-envelope {
  transform: translateY(-0.42rem) scale(1.012);
}

.gp-envelope-back,
.gp-envelope-front,
.gp-envelope-flap {
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in srgb, var(--gp-sage) 30%, transparent);
  background:
    radial-gradient(circle at 18% 16%, rgb(255 255 255 / 58%), transparent 36%),
    linear-gradient(118deg, rgb(77 92 70 / 5%), transparent 34% 68%, rgb(77 92 70 / 4%)),
    color-mix(in srgb, var(--gp-paper) 90%, var(--gp-background));
  transition: opacity 440ms ease, transform 660ms cubic-bezier(0.22, 1, 0.36, 1);
}

.gp-envelope-back {
  z-index: 1;
  overflow: hidden;
  box-shadow:
    0 2.25rem 3.5rem rgb(43 54 43 / 18%),
    0 0.35rem 0.8rem rgb(43 54 43 / 10%);
}

.gp-envelope-back::after {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(124deg, transparent 0 0.9rem, rgb(104 122 90 / 7%) 0.96rem 1rem);
  clip-path: polygon(0 0, 100% 0, 50% 63%);
  content: "";
  opacity: 0.7;
}

.gp-envelope-front {
  z-index: 5;
  clip-path: polygon(0 0, 50% 58%, 100% 0, 100% 100%, 0 100%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 18%), transparent 58%),
    linear-gradient(31deg, transparent 49.5%, rgb(80 96 76 / 12%) 50%, transparent 50.5%),
    linear-gradient(-31deg, transparent 49.5%, rgb(80 96 76 / 12%) 50%, transparent 50.5%),
    color-mix(in srgb, var(--gp-paper) 93%, var(--gp-background));
}

.gp-envelope-flap {
  z-index: 6;
  clip-path: polygon(0 0, 100% 0, 50% 63%);
  transform-origin: 50% 0;
  backface-visibility: hidden;
  background:
    repeating-linear-gradient(124deg, transparent 0 0.9rem, rgb(104 122 90 / 7%) 0.96rem 1rem),
    linear-gradient(150deg, rgb(255 255 255 / 42%), transparent 54%),
    color-mix(in srgb, var(--gp-paper) 88%, var(--gp-background));
  transition:
    opacity 420ms ease,
    transform 680ms cubic-bezier(0.65, 0, 0.25, 1);
}

.gp-letter {
  position: absolute;
  z-index: 3;
  inset: 5% 7% 8%;
  display: grid;
  min-width: 0;
  align-content: center;
  padding: 12% 9%;
  border: 1px solid color-mix(in srgb, var(--gp-sage) 28%, transparent);
  background:
    radial-gradient(circle at 18% 12%, rgb(255 255 255 / 72%), transparent 35%),
    linear-gradient(145deg, rgb(104 122 90 / 4%), transparent 52%),
    var(--gp-paper);
  box-shadow: 0 0.7rem 1.7rem rgb(43 54 43 / 10%);
  text-align: center;
  transform: translateY(4%) scale(0.985);
  transition:
    box-shadow 1.1s ease,
    opacity 420ms ease 850ms,
    transform 1.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.gp-letter span,
.gp-letter small,
.gp-address span {
  font-size: clamp(0.48rem, 1.6cqi, 0.65rem);
  font-weight: 720;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.gp-letter strong {
  overflow-wrap: anywhere;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.12rem, 4.7cqi, 2rem);
  font-weight: 480;
  line-height: 1.08;
}

.gp-letter small {
  margin-top: 0.7rem;
  color: color-mix(in srgb, var(--gp-ink) 66%, transparent);
  letter-spacing: 0.08em;
}

.gp-address {
  position: absolute;
  z-index: 7;
  inset: 14% 12% auto;
  display: grid;
  gap: 0.35rem;
  text-align: center;
  transition: opacity 260ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.gp-address strong {
  overflow-wrap: anywhere;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(0.7rem, 3.2cqi, 1.32rem);
  font-weight: 500;
  line-height: 1;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.gp-ribbon {
  position: absolute;
  z-index: 8;
  background: color-mix(in srgb, var(--gp-sage) 88%, #2f422f);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 14%);
  transition:
    opacity 280ms ease 120ms,
    transform 620ms cubic-bezier(0.4, 0, 0.2, 1);
}

.gp-ribbon-horizontal {
  top: 42%;
  right: -3%;
  left: -3%;
  height: 18%;
}

.gp-ribbon-vertical {
  top: -5%;
  bottom: -5%;
  left: 43%;
  width: 14%;
}

.gp-ribbon-knot {
  position: absolute;
  z-index: 9;
  top: 42%;
  left: 50%;
  width: 2.5rem;
  height: 2.5rem;
  color: color-mix(in srgb, var(--gp-sage) 88%, #2f422f);
  transform: translate(-50%, -35%);
  transition:
    opacity 240ms ease,
    transform 620ms cubic-bezier(0.4, 0, 0.2, 1);
}

.gp-ribbon-loop {
  position: absolute;
  top: 0.35rem;
  width: 1.7rem;
  height: 1.2rem;
  border: 0.45rem solid currentColor;
  border-radius: 50% 50% 45% 55%;
}

.gp-ribbon-loop-left {
  right: 1.15rem;
  transform: rotate(18deg);
}

.gp-ribbon-loop-right {
  left: 1.15rem;
  transform: scaleX(-1) rotate(18deg);
}

.gp-ribbon-knot i {
  position: absolute;
  inset: 0.7rem;
  border-radius: 50%;
  background: currentColor;
}


.gp-recipient-line {
  width: min(100%, 28rem);
  max-width: 28rem;
  margin: 0;
  padding-inline: 1rem;
  color: color-mix(in srgb, var(--gp-ink) 72%, transparent);
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(0.95rem, 3cqi, 1.2rem);
  transition: opacity 320ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.gp-recipient-line strong {
  display: block;
  margin-top: 0.18rem;
  color: var(--gp-ink);
  font-weight: 560;
  overflow-wrap: anywhere;
}

.gp-opening-hint {
  margin: 0.7rem 0 0;
  color: color-mix(in srgb, var(--gp-sage) 88%, var(--gp-ink));
  font-size: 0.72rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: opacity 320ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.gp-skip-opening {
  position: absolute;
  z-index: 12;
  right: clamp(1.25rem, 4cqi, 2.5rem);
  bottom: clamp(1.25rem, 4cqi, 2.5rem);
  min-height: 2.75rem;
  padding: 0.65rem 1rem;
  border: 1px solid color-mix(in srgb, var(--gp-sage) 44%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--gp-paper) 86%, transparent);
  box-shadow: 0 0.45rem 1.2rem rgb(43 54 43 / 10%);
  color: color-mix(in srgb, var(--gp-ink) 74%, var(--gp-sage));
  font: inherit;
  font-size: 0.72rem;
  font-weight: 720;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  pointer-events: auto;
  transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
}

.gp-skip-opening:hover {
  border-color: color-mix(in srgb, var(--gp-sage) 72%, transparent);
  background: var(--gp-paper);
  color: var(--gp-ink);
}

.gp-skip-opening:focus-visible {
  outline: 3px solid var(--gp-ink);
  outline-offset: 3px;
}

/* Garden Promise opening choreography */
.gp-ribbon {
  background: transparent;
  box-shadow: none;
  transition: opacity 180ms ease;
}

.gp-ribbon::before,
.gp-ribbon::after {
  position: absolute;
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--gp-sage) 78%, #233423),
      color-mix(in srgb, var(--gp-sage) 94%, #d8decf) 42%,
      color-mix(in srgb, var(--gp-sage) 82%, #314431)
    );
  border-radius: 0.16rem;
  box-shadow:
    inset 0.08rem 0 rgb(255 255 255 / 20%),
    inset -0.08rem 0 rgb(34 50 34 / 18%),
    0 0.28rem 0.58rem rgb(43 54 43 / 15%);
  content: "";
  transition:
    opacity 240ms ease 340ms,
    transform 900ms cubic-bezier(0.22, 1, 0.36, 1);
}

.gp-ribbon-horizontal::before,
.gp-ribbon-horizontal::after {
  top: 0;
  bottom: 0;
  width: 51%;
}

.gp-ribbon-horizontal::before,
.gp-ribbon-horizontal::after {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 24%), transparent 24% 64%, rgb(31 48 31 / 18%)),
    repeating-linear-gradient(0deg, transparent 0 0.16rem, rgb(255 255 255 / 5%) 0.18rem),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--gp-sage) 76%, #203220),
      color-mix(in srgb, var(--gp-sage) 96%, #e4e8dc) 48%,
      color-mix(in srgb, var(--gp-sage) 78%, #293c29)
    );
}

.gp-ribbon-vertical::before,
.gp-ribbon-vertical::after {
  background:
    linear-gradient(90deg, rgb(31 48 31 / 18%), transparent 30% 66%, rgb(255 255 255 / 22%)),
    repeating-linear-gradient(90deg, transparent 0 0.16rem, rgb(255 255 255 / 5%) 0.18rem),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--gp-sage) 74%, #203220),
      color-mix(in srgb, var(--gp-sage) 96%, #e4e8dc) 52%,
      color-mix(in srgb, var(--gp-sage) 78%, #293c29)
    );
}

.gp-ribbon-horizontal::before {
  left: 0;
  transform-origin: 100% 50%;
}

.gp-ribbon-horizontal::after {
  right: 0;
  transform-origin: 0 50%;
}

.gp-ribbon-vertical::before,
.gp-ribbon-vertical::after {
  right: 0;
  left: 0;
  height: 51%;
}

.gp-ribbon-vertical::before {
  top: 0;
  transform-origin: 50% 100%;
}

.gp-ribbon-vertical::after {
  bottom: 0;
  transform-origin: 50% 0;
}

.gp-ribbon-knot {
  top: 51%;
  width: 5.4rem;
  height: 4.7rem;
  filter: drop-shadow(0 0.5rem 0.5rem rgb(43 54 43 / 20%));
  transform: translate(-50%, -50%);
  transition:
    filter 420ms ease,
    opacity 240ms ease 340ms,
    transform 900ms cubic-bezier(0.22, 1, 0.36, 1);
}

.gp-ribbon-loop {
  top: 0.42rem;
  width: 3.7rem;
  height: 2.35rem;
  border: 0;
  border-radius: 68% 42% 62% 38%;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 24%), transparent 38% 66%, rgb(31 48 31 / 22%)),
    color-mix(in srgb, var(--gp-sage) 88%, #2f422f);
  box-shadow:
    inset 0 0.18rem rgb(255 255 255 / 16%),
    inset 0 -0.26rem rgb(31 48 31 / 14%);
  transform-origin: 100% 50%;
}

.gp-ribbon-loop::after {
  position: absolute;
  inset: 0.48rem 0.58rem 0.55rem 0.72rem;
  border-radius: inherit;
  background: linear-gradient(150deg, rgb(31 48 31 / 28%), rgb(255 255 255 / 8%));
  box-shadow: inset 0 0.18rem 0.32rem rgb(31 48 31 / 16%);
  content: "";
}

.gp-ribbon-loop-left {
  right: 2.65rem;
  transform: rotate(16deg);
}

.gp-ribbon-loop-right {
  left: 2.65rem;
  transform: scaleX(-1) rotate(14deg);
  transform-origin: 0 50%;
}

.gp-ribbon-tail {
  top: 2.45rem;
  width: 1.08rem;
  height: 4.3rem;
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--gp-sage) 78%, #233423),
      color-mix(in srgb, var(--gp-sage) 94%, #d8decf) 46%,
      color-mix(in srgb, var(--gp-sage) 82%, #314431)
    );
  box-shadow: inset 0.1rem 0 rgb(255 255 255 / 16%);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 52% 84%, 0 100%);
}

.gp-ribbon-tail-left {
  left: 1.45rem;
  transform: rotate(18deg);
}

.gp-ribbon-tail-right {
  right: 1.45rem;
  transform: rotate(-21deg);
}

.gp-ribbon-knot i {
  inset: 1.08rem 1.34rem;
  border-radius: 48% 56% 52% 44%;
  background:
    linear-gradient(115deg, rgb(255 255 255 / 28%), transparent 42%, rgb(31 48 31 / 18%)),
    currentColor;
  box-shadow:
    inset 0 0.18rem rgb(255 255 255 / 16%),
    0 0.22rem 0.35rem rgb(31 48 31 / 16%);
}

.gp-root .ie-root[data-opening-state="untying"] .gp-envelope {
  transform: translateY(0.12rem) scale(0.992);
}

.gp-root .ie-root[data-opening-state="untying"] .gp-ribbon-horizontal,
.gp-root .ie-root[data-opening-state="untying"] .gp-ribbon-vertical,
.gp-root .ie-root[data-opening-state="opening"] .gp-ribbon-horizontal,
.gp-root .ie-root[data-opening-state="opening"] .gp-ribbon-vertical {
  opacity: 1;
  transform: none;
}

.gp-root .ie-root[data-opening-state="untying"] .gp-ribbon-horizontal::before {
  transform: translateX(-4%) scaleX(0.95);
}

.gp-root .ie-root[data-opening-state="untying"] .gp-ribbon-horizontal::after {
  transform: translateX(5%) scaleX(0.94);
}

.gp-root .ie-root[data-opening-state="untying"] .gp-ribbon-vertical::before {
  transform: translateY(-3%) scaleY(0.95);
}

.gp-root .ie-root[data-opening-state="untying"] .gp-ribbon-vertical::after {
  transform: translateY(4%) scaleY(0.93);
}

.gp-root .ie-root[data-opening-state="untying"] .gp-ribbon-loop-left {
  transform: translate(-42%, 8%) rotate(-10deg) scale(1.06);
}

.gp-root .ie-root[data-opening-state="untying"] .gp-ribbon-loop-right {
  transform: translate(48%, 14%) scaleX(-1) rotate(-5deg) scale(1.1);
}

.gp-root .ie-root[data-opening-state="untying"] .gp-ribbon-tail-left {
  transform: translate(-30%, 15%) rotate(34deg);
}

.gp-root .ie-root[data-opening-state="untying"] .gp-ribbon-tail-right {
  transform: translate(34%, 10%) rotate(-40deg);
}

.gp-root .ie-root[data-opening-state="opening"] .gp-ribbon-horizontal::before {
  opacity: 0.08;
  transform: translateX(-112%) rotate(-2deg);
}

.gp-root .ie-root[data-opening-state="opening"] .gp-ribbon-horizontal::after {
  opacity: 0.08;
  transform: translateX(112%) rotate(2deg);
}

.gp-root .ie-root[data-opening-state="opening"] .gp-ribbon-vertical::before {
  opacity: 0.08;
  transform: translateY(-112%);
}

.gp-root .ie-root[data-opening-state="opening"] .gp-ribbon-vertical::after {
  opacity: 0.08;
  transform: translateY(112%);
}

.gp-root .ie-root[data-opening-state="opening"] .gp-ribbon-knot {
  filter: none;
  opacity: 0;
  transform: translate(-50%, 46%) rotate(14deg) scale(0.82);
}

.gp-root .ie-root[data-opening-state="opening"] .gp-envelope-flap {
  z-index: 2;
  opacity: 0.9;
  transform: rotateX(176deg);
}

.gp-root .ie-root[data-opening-state="opening"] .gp-address {
  opacity: 0;
  transform: translateY(-0.35rem);
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-opening {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-opening-kicker,
.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-recipient-line,
.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-opening-hint {
  transform: translateY(-0.4rem);
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-opening::before,
.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-opening-kicker,
.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-recipient-line,
.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-opening-hint,
.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-scene > .gp-sprig {
  opacity: 0;
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-envelope-back,
.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-envelope-front {
  opacity: 0;
  transform: translateY(9%) scale(0.94);
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-envelope-flap {
  opacity: 0;
  transform: rotateX(178deg) translateY(-4%) scale(0.96);
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-letter {
  z-index: 7;
  opacity: 0;
  box-shadow: 0 1.8rem 4rem rgb(43 54 43 / 16%);
  transform: translateY(-16%) scale(1.24);
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-ribbon,
.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-ribbon-knot {
  opacity: 0;
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .ie-content {
  animation: gp-content-takeover 1400ms linear both;
}
.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-ribbon-horizontal::before {
  opacity: 0;
  transform: translateX(-112%) rotate(-2deg);
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-ribbon-horizontal::after {
  opacity: 0;
  transform: translateX(112%) rotate(2deg);
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-ribbon-vertical::before {
  opacity: 0;
  transform: translateY(-112%);
}

.gp-root .ie-root[data-opening-state="letter-revealing"] .gp-ribbon-vertical::after {
  opacity: 0;
  transform: translateY(112%);
}


.gp-root .ie-root[data-opening-state="opened"] .ie-content {
  animation: none;
}

@keyframes gp-content-takeover {
  0%,
  62% {
    opacity: 0;
    animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
    transform: translateY(0.65rem) scale(0.985);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.gp-venue a:focus-visible {
  outline: 3px solid var(--gp-ink);
  outline-offset: 4px;
}

.gp-content {
  width: min(100%, 54rem);
  margin-inline: auto;
  padding: 0 clamp(1rem, 6cqi, 4rem) clamp(4rem, 10cqi, 7rem);
  outline: 0;
}

.gp-content:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--gp-sage) 64%, transparent);
}

.gp-section {
  position: relative;
  margin: 0;
}

.gp-hero {
  display: grid;
  min-height: clamp(37rem, 100svh, 52rem);
  align-content: center;
  padding: clamp(4rem, 12cqi, 7rem) clamp(1.35rem, 8cqi, 7rem);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--gp-sage) 24%, transparent);
  background: var(--gp-paper);
  text-align: center;
  box-shadow: 0 1.8rem 4rem rgb(58 67 54 / 10%);
}

.gp-hero::before,
.gp-hero::after {
  position: absolute;
  width: 5rem;
  height: 5rem;
  border-color: color-mix(in srgb, var(--gp-sage) 42%, transparent);
  content: "";
}

.gp-hero::before {
  top: 1rem;
  left: 1rem;
  border-top: 1px solid;
  border-left: 1px solid;
}

.gp-hero::after {
  right: 1rem;
  bottom: 1rem;
  border-right: 1px solid;
  border-bottom: 1px solid;
}

.gp-hero > .gp-sprig {
  position: absolute;
  width: clamp(5rem, 18cqi, 9rem);
  color: var(--gp-sage);
  opacity: 0.3;
}

.gp-hero > .gp-sprig-left {
  bottom: -2rem;
  left: -1rem;
  transform: rotate(-27deg);
}

.gp-hero > .gp-sprig-right {
  top: -2.4rem;
  right: -1rem;
  transform: scaleX(-1) rotate(-27deg);
}

.gp-hero h1,
.gp-section h2,
.gp-venue h3 {
  font-family: "Fraunces Variable", Georgia, serif;
  text-wrap: balance;
}

.gp-hero > * {
  min-width: 0;
}

.gp-hero h1 {
  max-width: 14ch;
  margin: 1.4rem auto 0;
  font-size: clamp(2.35rem, 11.5cqi, 7rem);
  font-weight: 440;
  letter-spacing: -0.065em;
  line-height: 0.88;
}

.gp-hero-copy {
  max-width: 34rem;
  margin: 1.6rem auto 0;
  color: color-mix(in srgb, var(--gp-ink) 76%, transparent);
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1rem, 3.7cqi, 1.35rem);
  line-height: 1.55;
}

.gp-hero time {
  display: block;
  margin-top: 2rem;
  color: var(--gp-sage);
  font-size: 0.7rem;
  font-weight: 760;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.gp-message {
  display: grid;
  gap: 1.5rem;
  padding: clamp(5rem, 14cqi, 8rem) clamp(1rem, 8cqi, 4rem);
}

.gp-section-number {
  width: 3rem;
  height: 3rem;
  border: 1px solid color-mix(in srgb, var(--gp-sage) 35%, transparent);
  border-radius: 50%;
  color: var(--gp-sage);
  font-family: "Fraunces Variable", Georgia, serif;
  line-height: 3rem;
  text-align: center;
}

.gp-message h2,
.gp-venue h2,
.gp-rsvp h2 {
  margin: 0;
  font-size: clamp(2.3rem, 8cqi, 4.7rem);
  font-weight: 450;
  letter-spacing: -0.055em;
  line-height: 0.98;
}

.gp-message p {
  max-width: 35rem;
  margin: 1.4rem 0 0;
  color: color-mix(in srgb, var(--gp-ink) 78%, transparent);
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.08rem, 3.8cqi, 1.45rem);
  line-height: 1.75;
}

.gp-venue {
  padding: clamp(3rem, 10cqi, 5.5rem) clamp(1.5rem, 9cqi, 5rem);
  border-top: 1px solid color-mix(in srgb, var(--gp-sage) 28%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--gp-sage) 28%, transparent);
  text-align: center;
}

.gp-venue h2 {
  margin-top: 1rem;
}

.gp-venue h3 {
  margin: 2rem 0 0;
  color: var(--gp-sage);
  font-size: clamp(1.3rem, 4cqi, 1.8rem);
  font-weight: 560;
}

.gp-venue address {
  max-width: 28rem;
  margin: 0.6rem auto 0;
  color: color-mix(in srgb, var(--gp-ink) 72%, transparent);
  font-size: 0.9rem;
  font-style: normal;
}

.gp-venue a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  margin-top: 1.6rem;
  padding-inline: 1rem;
  border-bottom: 1px solid var(--gp-sage);
  color: var(--gp-sage);
  font-size: 0.72rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-decoration: none;
  text-transform: uppercase;
}

.gp-rsvp {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
  padding: clamp(5rem, 14cqi, 8rem) clamp(1rem, 8cqi, 4rem) 2rem;
  text-align: center;
}

.gp-rsvp-rule {
  width: 1px;
  height: 3.5rem;
  margin-bottom: 1.8rem;
  background: var(--gp-sage);
}

.gp-rsvp > p {
  max-width: 28rem;
  margin: 1.3rem 0 0;
  color: color-mix(in srgb, var(--gp-ink) 74%, transparent);
}

.gp-rsvp > time {
  margin-top: 0.7rem;
  color: var(--gp-sage);
  font-size: 0.68rem;
  font-weight: 740;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.gp-rsvp [data-rsvp-slot] {
  width: 100%;
  min-width: 0;
  max-width: 25rem;
  min-height: 3.2rem;
  margin-top: 2rem;
  border: 1px solid color-mix(in srgb, var(--gp-sage) 30%, transparent);
  background: color-mix(in srgb, var(--gp-paper) 64%, transparent);
}

.gp-rsvp [data-rsvp-slot] > span {
  display: block;
  padding: 1rem;
  color: color-mix(in srgb, var(--gp-ink) 65%, transparent);
  font-size: 0.7rem;
}

.gp-footer {
  position: relative;
  display: grid;
  min-height: 12rem;
  overflow: hidden;
  background: color-mix(in srgb, var(--gp-sage) 88%, var(--gp-ink));
  color: var(--gp-sage-contrast);
  place-items: center;
}

.gp-footer p {
  position: relative;
  z-index: 1;
  margin: 0;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.4rem, 5cqi, 2rem);
  font-style: italic;
}

.gp-footer .gp-sprig {
  position: absolute;
  right: -1rem;
  bottom: -5rem;
  width: 10rem;
  opacity: 0.18;
  transform: scaleX(-1) rotate(-20deg);
}

@container (min-width: 42rem) {
  .gp-root .ie-root[data-opening-state="letter-revealing"] .gp-letter {
    transform: translateY(-16%) scale(1.62);
  }

  .gp-message {
    grid-template-columns: 5rem minmax(0, 1fr);
    align-items: start;
  }

  .gp-section-number {
    margin-top: 0.4rem;
  }
}

@media (max-height: 32rem) and (orientation: landscape) {
  .gp-opening,
  .gp-hero {
    min-height: 100svh;
  }

  .gp-opening {
    padding: 0.75rem clamp(2rem, 8cqi, 5rem);
  }

  .gp-scene {
    min-height: min(68svh, 20rem);
    margin-block: 0.35rem;
  }

  .gp-recipient-line,
  .gp-opening-hint {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gp-root *,
  .gp-root *::before,
  .gp-root *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
