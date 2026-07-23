"use client";

import type { InvitationDocument, InvitationSection } from "@invitica/invitation-schema";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import {
  type InvitationOpeningState,
  RibbonEnvelopeOpening,
  type RibbonEnvelopeVariant,
} from "./RibbonEnvelopeOpening.js";

export interface InvitationRendererProps {
  document: InvitationDocument;
  mode: "preview" | "published";
  onOpeningStateChange?: (state: InvitationOpeningState) => void;
  openingReplayKey?: number;
  recipientName?: string;
  reducedMotion?: boolean;
  rsvpSlot?: ReactNode;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported invitation section: ${JSON.stringify(value)}`);
}

function renderSection(
  section: InvitationSection,
  mode: InvitationRendererProps["mode"],
  rsvpSlot: ReactNode,
): ReactElement {
  switch (section.type) {
    case "hero":
      return (
        <section
          className="sr-section sr-hero"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.eyebrow ? <p className="sr-eyebrow">{section.props.eyebrow}</p> : null}
          <h1>{section.props.title}</h1>
          {section.props.subtitle ? <p>{section.props.subtitle}</p> : null}
          {section.props.dateLabel ? <time>{section.props.dateLabel}</time> : null}
        </section>
      );

    case "message":
      return (
        <section
          className="sr-section"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <p>{section.props.body}</p>
        </section>
      );

    case "venue":
      return (
        <section
          className="sr-section sr-venue"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <h3>{section.props.venueName}</h3>
          <address>{section.props.address}</address>
          {section.props.mapUrl ? (
            <a href={section.props.mapUrl} rel="noreferrer" target="_blank">
              Open map
            </a>
          ) : null}
        </section>
      );

    case "rsvp":
      return (
        <section
          className="sr-section sr-rsvp"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          {section.props.message ? <p>{section.props.message}</p> : null}
          {section.props.deadline ? (
            <time dateTime={section.props.deadline}>RSVP deadline</time>
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

function openingPresentation(motionStyle: InvitationDocument["opening"]["motionStyle"]): {
  kicker: string;
  letterLead: string;
  letterNote: string;
  recipientLead: string;
  variant: RibbonEnvelopeVariant;
} {
  switch (motionStyle) {
    case "cinematic":
      return {
        kicker: "An evening awaits",
        letterLead: "With honor",
        letterNote: "Your place is reserved",
        recipientLead: "Presented to",
        variant: "golden-hour",
      };
    case "playful":
      return {
        kicker: "A celebration is ready",
        letterLead: "Hello",
        letterNote: "The fun starts here",
        recipientLead: "Made especially for",
        variant: "sunday-joy",
      };
    case "elegant":
    case "minimal":
      return {
        kicker: "An invitation awaits",
        letterLead: "Dear",
        letterNote: "We saved you a place",
        recipientLead: "Prepared for",
        variant: "warm-editorial",
      };
    default:
      return assertNever(motionStyle);
  }
}

export function InvitationRenderer({
  document,
  mode,
  onOpeningStateChange,
  openingReplayKey,
  recipientName,
  reducedMotion = false,
  rsvpSlot,
}: InvitationRendererProps) {
  const recipient = recipientName ?? document.opening.fallbackRecipientText;
  const presentation = openingPresentation(document.opening.motionStyle);
  const style = {
    "--ie-background": document.theme.colors.background,
    "--ie-ink": document.theme.colors.text,
    "--ie-paper": document.theme.colors.surface,
    "--ie-ribbon": document.theme.colors.accent,
    "--invitation-accent-contrast": document.theme.colors.accentContrast,
    backgroundColor: "var(--ie-background)",
    color: "var(--ie-ink)",
  } as CSSProperties;

  return (
    <article
      className="sr-root"
      data-invitation-schema-version={document.schemaVersion}
      data-motion-enabled={!reducedMotion}
      data-render-mode={mode}
      data-spacing={document.theme.spacingScale}
      lang={document.locale}
      style={style}
    >
      <style>{standardRendererStyles}</style>
      <RibbonEnvelopeOpening
        kicker={presentation.kicker}
        letterLead={presentation.letterLead}
        letterNote={presentation.letterNote}
        mode={mode}
        onOpeningStateChange={onOpeningStateChange}
        openingReplayKey={openingReplayKey}
        recipient={recipient}
        recipientLead={presentation.recipientLead}
        reducedMotion={reducedMotion}
        variant={presentation.variant}
      >
        <main className="sr-content" data-envelope-focus-target tabIndex={-1}>
          {document.sections
            .filter((section) => section.visible)
            .map((section) => renderSection(section, mode, rsvpSlot))}
        </main>
      </RibbonEnvelopeOpening>
    </article>
  );
}

const standardRendererStyles = `
.sr-root {
  width: 100%;
  min-width: 0;
  overflow: clip;
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
  line-height: 1.55;
}
.sr-content {
  width: min(100%, 52rem);
  margin-inline: auto;
  padding: clamp(1rem, 6cqi, 4rem) clamp(1rem, 6cqi, 4rem) clamp(4rem, 10cqi, 7rem);
  outline: 0;
}
.sr-content:focus-visible {
  box-shadow: inset 0 0 0 3px var(--ie-ribbon);
}
.sr-section {
  padding: clamp(3.5rem, 10cqi, 6rem) clamp(1rem, 8cqi, 4rem);
  border-bottom: 1px solid color-mix(in srgb, var(--ie-ribbon) 28%, transparent);
}
.sr-section h1,
.sr-section h2,
.sr-section h3 {
  margin: 0;
  font-family: "Fraunces Variable", Georgia, serif;
  font-weight: 480;
  letter-spacing: -0.045em;
  line-height: 1;
  text-wrap: balance;
}
.sr-section h1 { font-size: clamp(3rem, 12cqi, 6.4rem); }
.sr-section h2 { font-size: clamp(2rem, 7cqi, 3.8rem); }
.sr-section h3 { margin-top: 1.5rem; font-size: clamp(1.3rem, 4cqi, 2rem); }
.sr-section p,
.sr-section address {
  max-width: 36rem;
  margin: 1.25rem 0 0;
  color: color-mix(in srgb, var(--ie-ink) 76%, transparent);
}
.sr-section address { font-style: normal; }
.sr-hero {
  min-height: clamp(30rem, 84cqi, 43rem);
  display: grid;
  align-content: center;
  background: var(--ie-paper);
  text-align: center;
}
.sr-hero p,
.sr-hero time { margin-inline: auto; }
.sr-eyebrow,
.sr-hero time {
  color: var(--ie-ribbon);
  font-size: 0.7rem;
  font-weight: 760;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.sr-hero time { margin-top: 1.5rem; }
.sr-venue,
.sr-rsvp { text-align: center; }
.sr-venue p,
.sr-venue address,
.sr-rsvp p { margin-inline: auto; }
.sr-venue a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  margin-top: 1.5rem;
  border-bottom: 1px solid currentColor;
  color: inherit;
  text-decoration: none;
}
.sr-rsvp [data-rsvp-slot] {
  width: min(100%, 25rem);
  margin: 1.8rem auto 0;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 35%, transparent);
  font-size: 0.72rem;
}
`;
