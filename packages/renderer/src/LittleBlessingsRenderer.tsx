"use client";

import type { InvitationSection } from "@invitica/invitation-schema";
import type { CSSProperties, KeyboardEvent, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import type {
  InvitationImageResolver,
  InvitationRendererProps,
  ResolvedRendererImage,
} from "./InvitationRenderer.js";

import { RibbonEnvelopeOpening, ribbonEnvelopeStyles } from "./RibbonEnvelopeOpening.js";

const HERO_IMAGE_SIZES = "(max-width: 40rem) 78vw, 22rem";
const CARD_IMAGE_SIZES = "(max-width: 40rem) 88vw, 16rem";
const LIGHTBOX_IMAGE_SIZES = "94vw";

type GallerySection = Extract<InvitationSection, { type: "gallery" }>;

function ChapelArch() {
  return (
    <svg aria-hidden="true" className="lb-arch" focusable="false" viewBox="0 0 120 200">
      <path d="M20 196V72a40 40 0 0 1 80 0v124" />
      <path d="M38 196V80a22 22 0 0 1 44 0v116" />
      <path d="M60 30v-9" />
      <path d="M38 38l-6-7" />
      <path d="M82 38l6-7" />
      <circle cx="60" cy="54" r="2.6" />
    </svg>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Little Blessings section: ${JSON.stringify(value)}`);
}

function unsupportedBlessingSection(section: InvitationSection): never {
  throw new Error(`Unsupported Little Blessings section: ${JSON.stringify(section)}`);
}

function formatBlessingDeadline(deadline: string, locale: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone,
    }).format(new Date(deadline));
  } catch {
    return deadline.slice(0, 10);
  }
}

function resolvedImageElement(
  image: ResolvedRendererImage,
  alt: string,
  className: string,
  loading: "eager" | "lazy",
  sizes: string,
): ReactElement | null {
  const ordered = [...image.renditions].sort((first, second) => first.width - second.width);
  const largest = ordered.at(-1);
  if (!largest) {
    return null;
  }

  return (
    <img
      alt={alt}
      className={className}
      decoding="async"
      height={image.height}
      loading={loading}
      sizes={sizes}
      src={largest.url}
      srcSet={ordered.map((rendition) => `${rendition.url} ${rendition.width}w`).join(", ")}
      width={image.width}
    />
  );
}

function LittleBlessingsCountdown({
  section,
}: {
  section: Extract<InvitationSection, { type: "countdown" }>;
}) {
  const [remainingLabel, setRemainingLabel] = useState<string | null>(null);

  useEffect(() => {
    const target = new Date(section.props.target).valueOf();
    if (Number.isNaN(target)) {
      setRemainingLabel(null);
      return;
    }

    const updateRemaining = () => {
      const remaining = target - Date.now();
      if (remaining <= 0) {
        setRemainingLabel("The celebration day is here");
        return;
      }

      const days = Math.floor(remaining / 86_400_000);
      const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
      setRemainingLabel(
        days > 0
          ? `${days} ${days === 1 ? "day" : "days"} and ${hours} ${hours === 1 ? "hour" : "hours"} to go`
          : `${Math.max(hours, 1)} ${hours === 1 ? "hour" : "hours"} to go`,
      );
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 60_000);
    return () => window.clearInterval(timer);
  }, [section.props.target]);

  return (
    <section
      className="lb-section lb-countdown"
      data-animation={section.animationPreset}
      data-section-type={section.type}
    >
      {section.props.heading ? <h2>{section.props.heading}</h2> : null}
      {remainingLabel ? <p className="lb-countdown-remaining">{remainingLabel}</p> : null}
      <time dateTime={section.props.target}>{section.props.dateLabel}</time>
    </section>
  );
}

interface GalleryEntry {
  readonly image: GallerySection["props"]["images"][number];
  readonly resolved: ResolvedRendererImage | null;
}

function LittleBlessingsGallery({
  resolveImage,
  section,
}: {
  resolveImage: InvitationImageResolver | undefined;
  section: GallerySection;
}) {
  const entries: readonly GalleryEntry[] = section.props.images.map((image) => ({
    image,
    resolved: resolveImage?.(image.assetId) ?? null,
  }));
  const openableIndexes = entries.flatMap((entry, index) => (entry.resolved ? [index] : []));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = activeIndex === null ? null : (entries[activeIndex] ?? null);

  useEffect(() => {
    if (activeIndex !== null) {
      closeButtonRef.current?.focus();
    }
  }, [activeIndex]);

  function closeLightbox(index: number) {
    setActiveIndex(null);
    triggerRefs.current[index]?.focus();
  }

  function stepLightbox(direction: 1 | -1) {
    if (activeIndex === null || openableIndexes.length < 2) {
      return;
    }

    const position = openableIndexes.indexOf(activeIndex);
    const nextPosition = (position + direction + openableIndexes.length) % openableIndexes.length;
    const nextIndex = openableIndexes[nextPosition];
    if (typeof nextIndex === "number") {
      setActiveIndex(nextIndex);
    }
  }

  function handleLightboxKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (activeIndex === null) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox(activeIndex);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepLightbox(1);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepLightbox(-1);
      return;
    }

    if (event.key === "Tab") {
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const controls = Array.from(
        dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
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
    }
  }

  return (
    <section
      className="lb-section lb-gallery"
      data-animation={section.animationPreset}
      data-section-type={section.type}
    >
      {section.props.heading ? <h2>{section.props.heading}</h2> : null}
      <div className="lb-gallery-grid">
        {entries.map((entry, index) => {
          const element = entry.resolved
            ? resolvedImageElement(
                entry.resolved,
                entry.image.alt,
                "lb-media-image",
                "lazy",
                CARD_IMAGE_SIZES,
              )
            : null;

          return (
            <figure data-asset-id={entry.image.assetId} key={entry.image.assetId}>
              {element ? (
                <button
                  aria-label={`View photo: ${entry.image.alt}`}
                  className="lb-gallery-trigger"
                  onClick={() => setActiveIndex(index)}
                  ref={(node) => {
                    triggerRefs.current[index] = node;
                  }}
                  type="button"
                >
                  {element}
                </button>
              ) : (
                <div aria-hidden="true" className="lb-media-placeholder">
                  Image pending creator upload
                </div>
              )}
              <figcaption>
                <strong>{entry.image.alt}</strong>
                {entry.image.caption ? <span>{entry.image.caption}</span> : null}
              </figcaption>
            </figure>
          );
        })}
      </div>
      {active?.resolved && activeIndex !== null ? (
        <div
          aria-label={`Photo: ${active.image.alt}`}
          aria-modal="true"
          className="lb-lightbox"
          onKeyDown={handleLightboxKeyDown}
          ref={dialogRef}
          role="dialog"
        >
          <div className="lb-lightbox-frame">
            {resolvedImageElement(
              active.resolved,
              active.image.alt,
              "lb-lightbox-image",
              "eager",
              LIGHTBOX_IMAGE_SIZES,
            )}
            <p>
              <strong>{active.image.alt}</strong>
              {active.image.caption ? <span>{active.image.caption}</span> : null}
            </p>
            <div className="lb-lightbox-controls">
              {openableIndexes.length > 1 ? (
                <button aria-label="Previous photo" onClick={() => stepLightbox(-1)} type="button">
                  Previous
                </button>
              ) : null}
              <button
                aria-label="Close photo view"
                onClick={() => closeLightbox(activeIndex)}
                ref={closeButtonRef}
                type="button"
              >
                Close
              </button>
              {openableIndexes.length > 1 ? (
                <button aria-label="Next photo" onClick={() => stepLightbox(1)} type="button">
                  Next
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function renderBlessingSection(
  section: InvitationSection,
  locale: string,
  mode: InvitationRendererProps["mode"],
  rsvpSlot: InvitationRendererProps["rsvpSlot"],
  timeZone: string,
  resolveImage: InvitationImageResolver | undefined,
): ReactElement {
  switch (section.type) {
    case "hero": {
      const heroAssetId = section.props.imageAssetId;
      const heroImage = heroAssetId ? (resolveImage?.(heroAssetId) ?? null) : null;
      const heroImageElement = heroImage
        ? resolvedImageElement(
            heroImage,
            "",
            "lb-media-image lb-hero-image",
            "eager",
            HERO_IMAGE_SIZES,
          )
        : null;

      return (
        <section
          className="lb-section lb-hero"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {heroAssetId ? (
            <div className="lb-hero-frame">
              {heroImageElement ?? (
                <div className="lb-media-placeholder" data-asset-id={heroAssetId}>
                  Baby portrait pending creator upload
                </div>
              )}
            </div>
          ) : null}
          {section.props.eyebrow ? <p className="lb-eyebrow">{section.props.eyebrow}</p> : null}
          <h1>{section.props.title}</h1>
          {section.props.subtitle ? <p className="lb-hero-copy">{section.props.subtitle}</p> : null}
          {section.props.dateLabel ? <time>{section.props.dateLabel}</time> : null}
        </section>
      );
    }

    case "message":
      return (
        <section
          className="lb-section lb-message"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <p>{section.props.body}</p>
        </section>
      );

    case "countdown":
      return <LittleBlessingsCountdown key={section.id} section={section} />;

    case "event-details":
      return (
        <section
          className="lb-section lb-event-details"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <div className="lb-event-grid">
            {section.props.events.map((event) => (
              <article key={`${event.label}-${event.startAt}`}>
                <p className="lb-eyebrow">{event.label}</p>
                <time dateTime={event.startAt}>{event.dateLabel}</time>
                <h3>{event.venueName}</h3>
                <address>{event.address}</address>
                {event.arrivalNote ? <p>{event.arrivalNote}</p> : null}
                {event.mapUrl ? (
                  <a href={event.mapUrl} rel="noreferrer" target="_blank">
                    View map
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      );

    case "participants":
      return (
        <section
          className="lb-section lb-participants"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <div className="lb-participant-grid">
            {section.props.groups.map((group) => (
              <div key={group.label}>
                <h3>{group.label}</h3>
                <ul>
                  {group.names.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      );

    case "schedule":
      return (
        <section
          className="lb-section lb-schedule"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <ol>
            {section.props.items.map((item) => (
              <li key={`${item.timeLabel}-${item.title}`}>
                <p className="lb-eyebrow">{item.timeLabel}</p>
                <h3>{item.title}</h3>
                {item.description ? <p>{item.description}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      );

    case "rsvp":
      return (
        <section
          className="lb-section lb-rsvp"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          {section.props.message ? <p>{section.props.message}</p> : null}
          {section.props.deadline ? (
            <time dateTime={section.props.deadline}>
              Kindly reply by {formatBlessingDeadline(section.props.deadline, locale, timeZone)}
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

    case "attire":
      return (
        <section
          className="lb-section lb-attire"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <p>{section.props.description}</p>
          {section.props.colors ? (
            <ul className="lb-color-list">
              {section.props.colors.map((color) => (
                <li key={color.value}>
                  <span aria-hidden="true" style={{ backgroundColor: color.value }} />
                  {color.label}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      );

    case "gallery":
      return (
        <LittleBlessingsGallery key={section.id} resolveImage={resolveImage} section={section} />
      );

    case "guidance":
      return (
        <section
          className="lb-section lb-guidance"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <ul>
            {section.props.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      );

    case "gifts":
      return (
        <section
          className="lb-section lb-gifts"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          {section.props.message ? <p>{section.props.message}</p> : null}
          <div className="lb-gift-grid">
            {section.props.items.map((item) => {
              const resolved = item.imageAssetId
                ? (resolveImage?.(item.imageAssetId) ?? null)
                : null;
              const element = resolved
                ? resolvedImageElement(resolved, "", "lb-media-image", "lazy", CARD_IMAGE_SIZES)
                : null;

              return (
                <article data-asset-id={item.imageAssetId} key={item.name}>
                  {item.imageAssetId
                    ? (element ?? (
                        <div aria-hidden="true" className="lb-media-placeholder">
                          Gift image pending creator upload
                        </div>
                      ))
                    : null}
                  <h3>{item.name}</h3>
                  {item.note ? <p>{item.note}</p> : null}
                </article>
              );
            })}
          </div>
        </section>
      );

    case "venue":
      return unsupportedBlessingSection(section);

    default:
      return assertNever(section);
  }
}

export function LittleBlessingsRenderer({
  document,
  mode,
  onOpeningStateChange,
  openingReplayKey,
  recipientName,
  reducedMotion = false,
  resolveImage,
  rsvpSlot,
}: InvitationRendererProps) {
  const recipient = recipientName ?? document.opening.fallbackRecipientText;
  const style = {
    "--lb-background": document.theme.colors.background,
    "--lb-paper": document.theme.colors.surface,
    "--lb-ink": document.theme.colors.text,
    "--lb-sage": document.theme.colors.accent,
    "--lb-sage-contrast": document.theme.colors.accentContrast,
    "--ie-background": document.theme.colors.background,
    "--ie-paper": document.theme.colors.surface,
    "--ie-ink": document.theme.colors.text,
    "--ie-ribbon": document.theme.colors.accent,
  } as CSSProperties;

  return (
    <article
      className="lb-root"
      data-invitation-schema-version={document.schemaVersion}
      data-motion-enabled={!reducedMotion}
      data-render-mode={mode}
      lang={document.locale}
      style={style}
    >
      <style>{`${ribbonEnvelopeStyles}\n${littleBlessingsStyles}`}</style>
      <RibbonEnvelopeOpening
        includeStyles={false}
        kicker="A little blessing awaits"
        letterLead="Dear"
        letterNote="Come celebrate with us"
        mode={mode}
        onOpeningStateChange={onOpeningStateChange}
        openingReplayKey={openingReplayKey}
        recipient={recipient}
        recipientLead="Prepared with love for"
        reducedMotion={reducedMotion}
        variant="little-blessings"
      >
        <main className="lb-content" data-envelope-focus-target tabIndex={-1}>
          {document.sections
            .filter((section) => section.visible)
            .map((section) =>
              renderBlessingSection(
                section,
                document.locale,
                mode,
                rsvpSlot,
                document.eventTimezone,
                resolveImage,
              ),
            )}
        </main>
        <footer className="lb-footer">
          <ChapelArch />
          <p>With grateful hearts, thank you for celebrating with us</p>
        </footer>
      </RibbonEnvelopeOpening>
    </article>
  );
}

const littleBlessingsStyles = `
.lb-root {
  --lb-gold: #c3a570;
  container-type: inline-size;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: clip;
  isolation: isolate;
  background:
    radial-gradient(ellipse at 50% -4%, rgb(255 253 247 / 85%), transparent 30rem),
    linear-gradient(180deg, rgb(255 253 247 / 30%), transparent 46%),
    var(--lb-background);
  color: var(--lb-ink);
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
  font-synthesis: none;
  line-height: 1.55;
}
.lb-root *,
.lb-root *::before,
.lb-root *::after {
  box-sizing: border-box;
}
.lb-root .ie-root {
  position: relative;
}
.lb-root[data-render-mode="published"] .ie-opening {
  min-height: 100svh;
}

/* Chapel Light envelope: arched vellum flap, pearl paper, seal-style knot */
.lb-root .ie-opening {
  background:
    radial-gradient(ellipse at 50% 30%, rgb(255 253 247 / 58%), transparent 22rem),
    linear-gradient(180deg, rgb(255 253 247 / 26%), transparent 55%);
}
.lb-root .ie-opening::before {
  border-color: color-mix(in srgb, var(--lb-gold) 42%, transparent);
}
.lb-root .ie-opening::after {
  position: absolute;
  width: min(72cqi, 21rem);
  aspect-ratio: 0.82;
  border: 1px solid color-mix(in srgb, var(--lb-gold) 45%, transparent);
  border-bottom: 0;
  border-radius: 999rem 999rem 0 0;
  content: "";
  pointer-events: none;
  transform: translateY(-6%);
}
.lb-root .ie-envelope-back,
.lb-root .ie-envelope-front {
  border-color: color-mix(in srgb, var(--lb-gold) 34%, transparent);
  background:
    radial-gradient(circle at 30% 12%, rgb(255 253 247 / 68%), transparent 42%),
    color-mix(in srgb, var(--lb-paper) 94%, var(--lb-background));
}
.lb-root .ie-envelope-flap {
  clip-path: ellipse(74% 66% at 50% 0%);
  border-color: color-mix(in srgb, var(--lb-gold) 34%, transparent);
  background:
    linear-gradient(180deg, rgb(255 253 247), rgb(248 243 233)),
    color-mix(in srgb, var(--lb-paper) 96%, var(--lb-background));
}
.lb-root .ie-letter {
  transform: translateY(15%);
}
.lb-root .ie-address {
  inset: 9% 12% auto;
}
.lb-root .ie-address strong {
  font-size: clamp(0.78rem, 3.2cqi, 1.15rem);
}
.lb-root .ie-letter {
  border: 1px solid color-mix(in srgb, var(--lb-gold) 45%, transparent);
  background:
    linear-gradient(rgb(255 255 255 / 62%), rgb(255 255 255 / 30%)),
    var(--lb-paper);
}
.lb-root .ie-ribbon {
  background: color-mix(in srgb, var(--lb-gold) 62%, var(--lb-sage));
}
.lb-root .ie-ribbon-horizontal {
  top: 46.5%;
  height: 7%;
}
.lb-root .ie-ribbon-vertical {
  left: 47%;
  width: 6%;
}
.lb-root .ie-ribbon-knot {
  top: 46.5%;
  color: color-mix(in srgb, var(--lb-gold) 72%, var(--lb-sage));
  transform: translate(-50%, -22%);
}
.lb-root .ie-ribbon-loop {
  width: 1.3rem;
  height: 0.95rem;
  border-width: 0.32rem;
}
.lb-root .ie-ribbon-loop-left { right: 0.92rem; }
.lb-root .ie-ribbon-loop-right { left: 0.92rem; }
.lb-root .ie-ribbon-tail {
  width: 0.4rem;
  height: 1.7rem;
}
.lb-root .ie-ribbon-knot i {
  inset: 0.55rem;
  box-shadow: 0 0 0 0.16rem rgb(255 253 247 / 85%), 0 0 0 0.28rem currentColor;
}

.lb-arch {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.2;
}
.lb-arch circle {
  fill: currentColor;
  stroke: none;
}

.lb-content {
  width: min(100%, 52rem);
  margin-inline: auto;
  padding: clamp(1rem, 6cqi, 4rem) clamp(1rem, 6cqi, 4rem) clamp(3rem, 8cqi, 5rem);
  outline: 0;
}
.lb-content:focus-visible {
  box-shadow: inset 0 0 0 3px var(--lb-sage);
}

.lb-section {
  position: relative;
  padding: clamp(3.2rem, 9cqi, 5.5rem) clamp(1rem, 7cqi, 3.5rem);
  text-align: center;
}
.lb-section + .lb-section::before {
  position: absolute;
  top: 0;
  left: 50%;
  width: min(58%, 16rem);
  border-top: 1px solid color-mix(in srgb, var(--lb-gold) 46%, transparent);
  content: "";
  transform: translateX(-50%);
}
.lb-section h1,
.lb-section h2,
.lb-section h3 {
  margin: 0;
  font-family: "Fraunces Variable", Georgia, serif;
  font-weight: 460;
  letter-spacing: -0.035em;
  line-height: 1.04;
  text-wrap: balance;
}
.lb-section h1 { font-size: clamp(2.7rem, 11cqi, 5.6rem); }
.lb-section h2 { font-size: clamp(1.8rem, 6.4cqi, 3.2rem); }
.lb-section h3 { margin-top: 1.4rem; font-size: clamp(1.2rem, 3.8cqi, 1.8rem); }
.lb-section p,
.lb-section address {
  max-width: 34rem;
  margin: 1.2rem auto 0;
  color: color-mix(in srgb, var(--lb-ink) 78%, transparent);
}
.lb-section address { font-style: normal; }
.lb-eyebrow {
  margin: 0;
  color: color-mix(in srgb, var(--lb-gold) 40%, var(--lb-ink));
  font-size: 0.68rem;
  font-weight: 740;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}

.lb-hero {
  display: grid;
  min-height: clamp(30rem, 82cqi, 42rem);
  align-content: center;
  justify-items: center;
}
.lb-hero-frame {
  width: min(100%, 19rem);
  margin-bottom: 2rem;
  padding: clamp(0.5rem, 1.6cqi, 0.8rem);
  border: 1px solid color-mix(in srgb, var(--lb-gold) 52%, transparent);
  border-radius: 999rem 999rem 0 0;
  background: linear-gradient(rgb(255 253 247 / 66%), rgb(255 253 247 / 22%)), var(--lb-paper);
}
.lb-hero-frame .lb-hero-image,
.lb-hero-frame .lb-media-placeholder {
  border-radius: 999rem 999rem 0 0;
  margin: 0;
}
.lb-hero-image {
  aspect-ratio: 4 / 5;
  object-fit: cover;
}
.lb-hero .lb-eyebrow { margin-top: 0; }
.lb-hero h1 { margin-top: 0.9rem; }
.lb-hero time {
  display: block;
  margin-top: 1.4rem;
  color: color-mix(in srgb, var(--lb-gold) 40%, var(--lb-ink));
  font-size: 0.72rem;
  font-weight: 740;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.lb-message p {
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.06rem, 3.2cqi, 1.3rem);
  line-height: 1.6;
}

.lb-countdown time {
  display: block;
  margin-top: 1.1rem;
  color: color-mix(in srgb, var(--lb-ink) 78%, transparent);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.lb-countdown-remaining {
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.5rem, 5cqi, 2.4rem);
  color: var(--lb-ink);
}

.lb-event-grid,
.lb-participant-grid,
.lb-gift-grid,
.lb-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
  gap: 1.1rem;
  margin-top: 2rem;
}
.lb-event-grid > article,
.lb-participant-grid > div,
.lb-gift-grid > article {
  min-width: 0;
  margin: 0;
  padding: clamp(1.4rem, 4cqi, 2rem) 1.25rem 1.5rem;
  border: 1px solid color-mix(in srgb, var(--lb-gold) 38%, transparent);
  border-radius: 6rem 6rem 0.35rem 0.35rem;
  background: linear-gradient(rgb(255 253 247 / 55%), transparent 40%), var(--lb-paper);
  text-align: center;
}
.lb-event-grid time {
  display: block;
  margin-top: 0.8rem;
  color: color-mix(in srgb, var(--lb-gold) 40%, var(--lb-ink));
  font-weight: 700;
}
.lb-event-grid address,
.lb-event-grid p {
  margin-inline: auto;
}
.lb-event-grid a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  margin-top: 1rem;
  border-bottom: 1px solid currentColor;
  color: inherit;
  text-decoration: none;
}

.lb-participant-grid ul {
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}
.lb-participant-grid li {
  margin-top: 0.45rem;
  overflow-wrap: anywhere;
}

.lb-schedule ol {
  width: min(100%, 30rem);
  margin: 2rem auto 0;
  padding: 0;
  list-style: none;
  text-align: center;
}
.lb-schedule li {
  position: relative;
  padding: 1.1rem 0 1.4rem;
}
.lb-schedule li + li::before {
  position: absolute;
  top: 0;
  left: 50%;
  height: 0.85rem;
  border-left: 1px solid color-mix(in srgb, var(--lb-gold) 55%, transparent);
  content: "";
  transform: translateX(-50%);
}
.lb-schedule h3 { margin-top: 0.4rem; }
.lb-schedule p { margin-top: 0.5rem; }

.lb-rsvp time {
  display: block;
  margin-top: 1.2rem;
  color: color-mix(in srgb, var(--lb-gold) 40%, var(--lb-ink));
  font-weight: 700;
}
.lb-rsvp [data-rsvp-slot] {
  width: min(100%, 25rem);
  margin: 1.8rem auto 0;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--lb-gold) 45%, transparent);
  border-radius: 3rem 3rem 0.3rem 0.3rem;
  background: linear-gradient(rgb(255 253 247 / 55%), transparent), var(--lb-paper);
  font-size: 0.72rem;
}

.lb-color-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin: 1.75rem auto 0;
  padding: 0;
  list-style: none;
}
.lb-color-list li {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.55rem;
}
.lb-color-list span {
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid color-mix(in srgb, var(--lb-gold) 62%, transparent);
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px rgb(255 253 247 / 75%);
}

.lb-gallery-grid figure {
  min-width: 0;
  margin: 0;
  text-align: center;
}
.lb-gallery-trigger {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}
.lb-gallery-trigger:focus-visible {
  outline: 3px solid var(--lb-ink);
  outline-offset: 0.3rem;
}
.lb-gallery-grid .lb-media-image,
.lb-gallery-grid .lb-media-placeholder {
  border-radius: 5rem 5rem 0.35rem 0.35rem;
}
.lb-gallery-grid figcaption {
  display: grid;
  gap: 0.3rem;
  margin-top: 0.75rem;
  font-size: 0.86rem;
}
.lb-gallery-grid figcaption span {
  color: color-mix(in srgb, var(--lb-ink) 78%, transparent);
}

.lb-lightbox {
  position: fixed;
  z-index: 40;
  inset: 0;
  display: grid;
  padding: clamp(0.8rem, 4cqi, 2rem);
  background: color-mix(in srgb, var(--lb-ink) 78%, transparent);
  place-items: center;
}
.lb-lightbox-frame {
  display: grid;
  width: min(100%, 42rem);
  max-height: 100%;
  overflow: auto;
  padding: clamp(0.8rem, 3cqi, 1.4rem);
  border: 1px solid color-mix(in srgb, var(--lb-gold) 55%, transparent);
  background: var(--lb-paper);
  text-align: center;
}
.lb-lightbox-image {
  width: 100%;
  height: auto;
}
.lb-lightbox-frame p {
  display: grid;
  gap: 0.3rem;
  margin: 0.9rem 0 0;
}
.lb-lightbox-frame p span {
  color: color-mix(in srgb, var(--lb-ink) 78%, transparent);
}
.lb-lightbox-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.7rem;
  margin-top: 1rem;
}
.lb-lightbox-controls button {
  min-width: 5.5rem;
  min-height: 2.75rem;
  padding: 0.4rem 1rem;
  border: 1px solid color-mix(in srgb, var(--lb-ink) 45%, transparent);
  background: var(--lb-paper);
  color: var(--lb-ink);
  font: inherit;
  cursor: pointer;
}
.lb-lightbox-controls button:focus-visible {
  outline: 3px solid var(--lb-ink);
  outline-offset: 0.2rem;
}

.lb-guidance ul {
  width: min(100%, 32rem);
  margin: 1.75rem auto 0;
  padding-left: 1.25rem;
  text-align: left;
}
.lb-guidance li + li { margin-top: 0.9rem; }

.lb-gift-grid h3 { margin-top: 1rem; }
.lb-gift-grid p { margin-top: 0.5rem; font-size: 0.92rem; }
.lb-gift-grid .lb-media-image,
.lb-gift-grid .lb-media-placeholder {
  border-radius: 4rem 4rem 0.3rem 0.3rem;
}

.lb-media-placeholder {
  display: grid;
  min-height: 8rem;
  padding: 1rem;
  border: 1px dashed color-mix(in srgb, var(--lb-gold) 55%, transparent);
  background: color-mix(in srgb, var(--lb-paper) 76%, var(--lb-background));
  color: color-mix(in srgb, var(--lb-ink) 78%, transparent);
  font-size: 0.75rem;
  place-items: center;
  text-align: center;
}
.lb-media-image {
  display: block;
  width: 100%;
  height: auto;
}

.lb-footer {
  display: grid;
  padding: clamp(2.5rem, 8cqi, 4rem) 1rem clamp(3rem, 9cqi, 4.5rem);
  color: color-mix(in srgb, var(--lb-ink) 78%, transparent);
  justify-items: center;
  text-align: center;
}
.lb-footer .lb-arch {
  width: 3rem;
  color: color-mix(in srgb, var(--lb-gold) 72%, transparent);
}
.lb-footer p {
  max-width: 26rem;
  margin: 1rem 0 0;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: 1.02rem;
}
`;
