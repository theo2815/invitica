"use client";

import type { InvitationDocument, InvitationSection } from "@invitica/invitation-schema";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useState } from "react";

import { InteractiveMap, interactiveMapStyles } from "./InteractiveMap.js";
import type {
  InvitationImageResolver,
  InvitationRendererProps,
  ResolvedRendererImage,
} from "./InvitationRenderer.js";
import {
  largestImageRendition,
  PhotoPreviewDialog,
  type PhotoPreviewItem,
  PhotoPreviewTrigger,
  photoPreviewStyles,
} from "./PhotoPreview.js";
import { PoweredByInvitica, poweredByInviticaStyles } from "./PoweredByInvitica.js";
import { RibbonEnvelopeOpening, type RibbonEnvelopeVariant } from "./RibbonEnvelopeOpening.js";
import { isSectionVisibleToAudience } from "./sectionVisibility.js";
import { useCountdown } from "./useCountdown.js";

export type OccasionTemplateVariant = "garden-promise" | "golden-hour" | "sunday-joy";

interface OccasionProfile {
  readonly kicker: string;
  readonly letterLead: string;
  readonly letterNote: string;
  readonly recipientLead: string;
  readonly variant: RibbonEnvelopeVariant;
}

const profiles: Record<OccasionTemplateVariant, OccasionProfile> = {
  "garden-promise": {
    kicker: "A promise has taken root",
    letterLead: "Dear",
    letterNote: "Meet us in the garden",
    recipientLead: "Prepared with care for",
    variant: "garden-promise",
  },
  "golden-hour": {
    kicker: "The evening begins here",
    letterLead: "With honor",
    letterNote: "Your place is reserved",
    recipientLead: "Presented to",
    variant: "golden-hour",
  },
  "sunday-joy": {
    kicker: "A party is waiting",
    letterLead: "Hello",
    letterNote: "Come ready to play",
    recipientLead: "Made especially for",
    variant: "sunday-joy",
  },
};

const HERO_IMAGE_SIZES = "(max-width: 40rem) 76vw, 23rem";
const CARD_IMAGE_SIZES = "(max-width: 40rem) 88vw, 19rem";

function assertNever(value: never): never {
  throw new Error(`Unsupported invitation section: ${JSON.stringify(value)}`);
}

function TemplateMotif({
  context,
  variant,
}: {
  context: "cover" | "hero";
  variant: OccasionTemplateVariant;
}) {
  return (
    <span aria-hidden="true" className="ot-motif" data-context={context} data-motif={variant}>
      {variant === "golden-hour" ? <b>XVIII</b> : null}
      <i />
      <i />
      <i />
    </span>
  );
}

function SceneDecoration({ variant }: { variant: OccasionTemplateVariant }) {
  return (
    <span aria-hidden="true" className="ot-scene-decoration" data-motif={variant}>
      <i />
      <i />
      <i />
    </span>
  );
}

function ResponsiveImage({
  className,
  image,
  loading,
  sizes,
}: {
  className: string;
  image: ResolvedRendererImage;
  loading: "eager" | "lazy";
  sizes: string;
}) {
  const renditions = [...image.renditions].sort((left, right) => left.width - right.width);
  const largest = renditions.at(-1);
  if (!largest) return null;

  return (
    <img
      alt=""
      className={className}
      decoding="async"
      height={largest.height}
      loading={loading}
      sizes={sizes}
      src={largest.url}
      srcSet={renditions.map((rendition) => `${rendition.url} ${rendition.width}w`).join(", ")}
      width={largest.width}
    />
  );
}

function CountdownSection({
  section,
}: {
  section: Extract<InvitationSection, { type: "countdown" }>;
}) {
  const remaining = useCountdown(section.props.target);
  const units = remaining
    ? [
        ["Days", remaining.days],
        ["Hours", remaining.hours],
        ["Minutes", remaining.minutes],
        ["Seconds", remaining.seconds],
      ]
    : [];

  return (
    <section
      className="ot-section ot-countdown"
      data-animation={section.animationPreset}
      data-section-type={section.type}
    >
      {section.props.heading ? <h2>{section.props.heading}</h2> : null}
      {remaining ? (
        remaining.isPast ? (
          <p className="ot-countdown-finished">The celebration has begun.</p>
        ) : (
          <div
            aria-label={`${remaining.days} days, ${remaining.hours} hours, ${remaining.minutes} minutes, and ${remaining.seconds} seconds remaining`}
            className="ot-countdown-grid"
            role="timer"
          >
            {units.map(([label, value]) => (
              <span key={String(label)}>
                <strong>{value}</strong>
                <small>{label}</small>
              </span>
            ))}
          </div>
        )
      ) : null}
      <time dateTime={section.props.target}>{section.props.dateLabel}</time>
    </section>
  );
}

function GallerySection({
  reducedMotion,
  resolveImage,
  section,
}: {
  reducedMotion: boolean;
  resolveImage: InvitationImageResolver | undefined;
  section: Extract<InvitationSection, { type: "gallery" }>;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const resolvedEntries = section.props.images.map((image, index) => ({
    image,
    index,
    resolved: resolveImage?.(image.assetId) ?? null,
  }));
  const previewItems: readonly PhotoPreviewItem[] = resolvedEntries.flatMap(
    ({ image, index, resolved }) =>
      resolved
        ? [
            {
              id: image.assetId,
              image: resolved,
              label: image.title ?? image.caption ?? `Photo ${index + 1}`,
              ...(image.caption ? { description: image.caption } : {}),
              ...(image.title ? { title: image.title } : {}),
            },
          ]
        : [],
  );

  return (
    <>
      <section
        className="ot-section ot-gallery"
        data-animation={section.animationPreset}
        data-section-type={section.type}
      >
        {section.props.heading ? <h2>{section.props.heading}</h2> : null}
        {section.props.description ? (
          <p className="ot-section-lead">{section.props.description}</p>
        ) : null}
        <div className="ot-gallery-grid">
          {resolvedEntries.map(({ image, index, resolved }) => {
            const previewIndex = previewItems.findIndex((item) => item.id === image.assetId);
            const largest = resolved ? largestImageRendition(resolved) : null;
            const label =
              image.title ??
              image.caption ??
              `Photo ${index + 1} of ${section.props.images.length}`;
            return (
              <figure data-photo-index={index + 1} key={image.assetId}>
                {resolved && largest ? (
                  <PhotoPreviewTrigger
                    href={largest.url}
                    label={`View photo: ${label}`}
                    onOpen={() => setActiveIndex(previewIndex)}
                  >
                    <ResponsiveImage
                      className="ot-photo"
                      image={resolved}
                      loading="lazy"
                      sizes={CARD_IMAGE_SIZES}
                    />
                  </PhotoPreviewTrigger>
                ) : (
                  <div aria-hidden="true" className="ot-media-placeholder">
                    Photo pending creator upload
                  </div>
                )}
                {image.title || image.caption ? (
                  <figcaption>
                    {image.title ? <strong>{image.title}</strong> : null}
                    {image.caption ? <span>{image.caption}</span> : null}
                  </figcaption>
                ) : null}
              </figure>
            );
          })}
        </div>
      </section>
      <PhotoPreviewDialog
        activeIndex={activeIndex}
        items={previewItems}
        onActiveIndexChange={setActiveIndex}
        onClose={() => setActiveIndex(null)}
        reducedMotion={reducedMotion}
      />
    </>
  );
}

function EventDetailsSection({
  mapTileKey,
  reducedMotion,
  section,
}: {
  mapTileKey: string | undefined;
  reducedMotion: boolean;
  section: Extract<InvitationSection, { type: "event-details" }>;
}) {
  return (
    <section
      className="ot-section ot-event-details"
      data-animation={section.animationPreset}
      data-section-type={section.type}
    >
      {section.props.heading ? <h2>{section.props.heading}</h2> : null}
      <div className="ot-event-grid">
        {section.props.events.map((event, index) => (
          <article data-event-number={index + 1} key={`${event.label}-${event.startAt}`}>
            <p className="ot-kicker">{event.label}</p>
            <time dateTime={event.startAt}>{event.dateLabel}</time>
            <h3>{event.venueName}</h3>
            <address>{event.address}</address>
            {event.arrivalNote ? <p>{event.arrivalNote}</p> : null}
            {event.mapUrl ? (
              <a href={event.mapUrl} rel="noreferrer" target="_blank">
                Get directions
              </a>
            ) : null}
            {mapTileKey && event.latitude !== undefined && event.longitude !== undefined ? (
              <InteractiveMap
                label={event.venueName}
                latitude={event.latitude}
                longitude={event.longitude}
                reducedMotion={reducedMotion}
                tileKey={mapTileKey}
              />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function formatDeadline(
  value: string,
  locale: InvitationDocument["locale"],
  eventTimezone: string,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Reply by the date in your invitation";
  return `Reply by ${new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: eventTimezone,
    year: "numeric",
  }).format(date)}`;
}

function renderSection(
  section: InvitationSection,
  {
    document,
    mapTileKey,
    mode,
    reducedMotion,
    resolveImage,
    rsvpSlot,
    variant,
  }: {
    document: InvitationDocument;
    mapTileKey: string | undefined;
    mode: InvitationRendererProps["mode"];
    reducedMotion: boolean;
    resolveImage: InvitationImageResolver | undefined;
    rsvpSlot: ReactNode;
    variant: OccasionTemplateVariant;
  },
): ReactElement {
  switch (section.type) {
    case "hero": {
      const resolved = section.props.imageAssetId
        ? (resolveImage?.(section.props.imageAssetId) ?? null)
        : null;
      return (
        <section
          className="ot-section ot-hero"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          <TemplateMotif context="hero" variant={variant} />
          {section.props.imageAssetId ? (
            resolved ? (
              <ResponsiveImage
                className="ot-hero-photo"
                image={resolved}
                loading="eager"
                sizes={HERO_IMAGE_SIZES}
              />
            ) : (
              <div className="ot-media-placeholder ot-hero-placeholder">
                Portrait pending creator upload
              </div>
            )
          ) : null}
          <div className="ot-hero-copy">
            {section.props.eyebrow ? <p className="ot-kicker">{section.props.eyebrow}</p> : null}
            <h1>{section.props.title}</h1>
            {section.props.subtitle ? <p>{section.props.subtitle}</p> : null}
            {section.props.dateLabel ? <time>{section.props.dateLabel}</time> : null}
          </div>
        </section>
      );
    }

    case "message":
      return (
        <section
          className="ot-section ot-message"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <p className="ot-message-body">{section.props.body}</p>
          {section.props.signature ? (
            <footer className="ot-signature">
              {section.props.signature.lead ? <span>{section.props.signature.lead}</span> : null}
              {section.props.signature.names.map((name) => (
                <strong key={name}>{name}</strong>
              ))}
            </footer>
          ) : null}
        </section>
      );

    case "countdown":
      return <CountdownSection key={section.id} section={section} />;

    case "event-details":
      return (
        <EventDetailsSection
          key={section.id}
          mapTileKey={mapTileKey}
          reducedMotion={reducedMotion}
          section={section}
        />
      );

    case "participants":
      return (
        <section
          className="ot-section ot-participants"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <div className="ot-participant-grid">
            {section.props.groups.map((group, index) => (
              <article data-group-number={index + 1} key={`${group.label}-${index}`}>
                <h3>{group.label}</h3>
                <ul>
                  {group.names.map((name, nameIndex) => (
                    <li key={`${name}-${nameIndex}`}>{name}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      );

    case "schedule":
      return (
        <section
          className="ot-section ot-schedule"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <ol>
            {section.props.items.map((item, index) => (
              <li key={`${item.timeLabel}-${item.title}-${index}`}>
                <time>{item.timeLabel}</time>
                <div>
                  <h3>{item.title}</h3>
                  {item.description ? <p>{item.description}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      );

    case "attire":
      return (
        <section
          className="ot-section ot-attire"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <p className="ot-section-lead">{section.props.description}</p>
          {section.props.colors ? (
            <ul className="ot-color-list" aria-label="Suggested colors">
              {section.props.colors.map((color) => (
                <li key={`${color.label}-${color.value}`}>
                  <span aria-hidden="true" style={{ backgroundColor: color.value }} />
                  {color.label}
                </li>
              ))}
            </ul>
          ) : null}
          {section.props.groups ? (
            <div className="ot-attire-groups">
              {section.props.groups.map((group) => (
                <article key={group.label}>
                  <h3>{group.label}</h3>
                  <p>{group.description}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      );

    case "gallery":
      return (
        <GallerySection
          key={section.id}
          reducedMotion={reducedMotion}
          resolveImage={resolveImage}
          section={section}
        />
      );

    case "guidance":
      return (
        <section
          className="ot-section ot-guidance"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <ul>
            {section.props.items.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </section>
      );

    case "gifts":
      return (
        <section
          className="ot-section ot-gifts"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          {section.props.message ? (
            <p className="ot-section-lead">{section.props.message}</p>
          ) : null}
          <div className="ot-gift-list">
            {section.props.items.map((item, index) => {
              const resolved = item.imageAssetId
                ? (resolveImage?.(item.imageAssetId) ?? null)
                : null;
              return (
                <article key={`${item.name}-${index}`}>
                  {item.imageAssetId ? (
                    resolved ? (
                      <ResponsiveImage
                        className="ot-gift-photo"
                        image={resolved}
                        loading="lazy"
                        sizes={CARD_IMAGE_SIZES}
                      />
                    ) : (
                      <div aria-hidden="true" className="ot-media-placeholder">
                        Gift photo pending creator upload
                      </div>
                    )
                  ) : null}
                  <h3>{item.name}</h3>
                  {item.note ? <p>{item.note}</p> : null}
                </article>
              );
            })}
          </div>
        </section>
      );

    case "rsvp":
      return (
        <section
          className="ot-section ot-rsvp"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          <span aria-hidden="true" className="ot-rsvp-mark" />
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          {section.props.message ? <p>{section.props.message}</p> : null}
          {section.props.deadline ? (
            <time dateTime={section.props.deadline}>
              {formatDeadline(section.props.deadline, document.locale, document.eventTimezone)}
            </time>
          ) : null}
          <div className="ot-rsvp-slot" data-rsvp-slot="true">
            {rsvpSlot ?? (
              <span>
                {mode === "preview"
                  ? "Response form appears here after publication."
                  : "Open your personal invitation link to respond."}
              </span>
            )}
          </div>
        </section>
      );

    case "venue":
      return (
        <section
          className="ot-section ot-venue"
          data-animation={section.animationPreset}
          data-section-type={section.type}
          key={section.id}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <h3>{section.props.venueName}</h3>
          <address>{section.props.address}</address>
          {section.props.mapUrl ? (
            <a href={section.props.mapUrl} rel="noreferrer" target="_blank">
              Get directions
            </a>
          ) : null}
        </section>
      );

    default:
      return assertNever(section);
  }
}

export function OccasionTemplateRenderer({
  audience = "general",
  document,
  mapTileKey,
  mode,
  onOpeningStateChange,
  openingReplayKey,
  recipientName,
  reducedMotion = false,
  resolveImage,
  rsvpSlot,
  variant,
}: InvitationRendererProps & { variant: OccasionTemplateVariant }) {
  const profile = profiles[variant];
  const recipient = recipientName ?? document.opening.fallbackRecipientText;
  const style = {
    "--ie-background": document.theme.colors.background,
    "--ie-ink": document.theme.colors.text,
    "--ie-paper": document.theme.colors.surface,
    "--ie-ribbon": document.theme.colors.accent,
    "--ot-accent-contrast": document.theme.colors.accentContrast,
    backgroundColor: "var(--ie-background)",
    color: "var(--ie-ink)",
  } as CSSProperties;

  return (
    <article
      className="ot-root"
      data-invitation-schema-version={document.schemaVersion}
      data-motion-enabled={!reducedMotion}
      data-render-mode={mode}
      data-spacing={document.theme.spacingScale}
      data-template={variant}
      lang={document.locale}
      style={style}
    >
      <style>{occasionTemplateStyles}</style>
      <RibbonEnvelopeOpening
        coverMark={<TemplateMotif context="cover" variant={variant} />}
        kicker={profile.kicker}
        letterLead={profile.letterLead}
        letterNote={profile.letterNote}
        mode={mode}
        onOpeningStateChange={onOpeningStateChange}
        openingReplayKey={openingReplayKey}
        pace="standard"
        recipient={recipient}
        recipientLead={profile.recipientLead}
        reducedMotion={reducedMotion}
        sceneDecoration={<SceneDecoration variant={variant} />}
        variant={profile.variant}
      >
        <main className="ot-content" data-envelope-focus-target tabIndex={-1}>
          {document.sections
            .filter((section) => isSectionVisibleToAudience(section, mode, audience))
            .map((section) =>
              renderSection(section, {
                document,
                mapTileKey,
                mode,
                reducedMotion,
                resolveImage,
                rsvpSlot,
                variant,
              }),
            )}
        </main>
        <footer className="ot-footer">
          <TemplateMotif context="cover" variant={variant} />
          <PoweredByInvitica />
        </footer>
      </RibbonEnvelopeOpening>
    </article>
  );
}

const occasionTemplateStyles = `
${interactiveMapStyles}
${photoPreviewStyles}
${poweredByInviticaStyles}
.ot-root {
  container-type: inline-size;
  width: 100%;
  min-width: 0;
  overflow: clip;
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
  line-height: 1.6;
}
.ot-root *,
.ot-root *::before,
.ot-root *::after { box-sizing: border-box; }
.ot-root[data-render-mode="published"] .ie-opening { min-height: 100svh; }
.ot-content {
  width: min(100%, 64rem);
  margin-inline: auto;
  outline: 0;
}
.ot-content:focus-visible {
  box-shadow: inset 0 0 0 3px var(--ie-ribbon);
}
.ot-section {
  position: relative;
  min-width: 0;
  padding: clamp(4rem, 11cqi, 8rem) clamp(1.25rem, 8cqi, 5rem);
}
.ot-section h1,
.ot-section h2,
.ot-section h3 {
  margin: 0;
  font-family: "Fraunces Variable", Georgia, serif;
  font-weight: 480;
  line-height: 1.04;
  text-wrap: balance;
}
.ot-section h1 {
  font-size: clamp(3.4rem, 14cqi, 8rem);
  letter-spacing: -0.065em;
}
.ot-section h2 {
  font-size: clamp(2.25rem, 7cqi, 4.6rem);
  letter-spacing: -0.045em;
}
.ot-section h3 {
  font-size: clamp(1.15rem, 3.4cqi, 1.75rem);
  letter-spacing: -0.025em;
}
.ot-section p,
.ot-section address {
  overflow-wrap: anywhere;
}
.ot-section address { font-style: normal; }
.ot-kicker {
  margin: 0 0 1rem;
  color: var(--ie-ribbon);
  font-size: 0.7rem;
  font-weight: 760;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.ot-section-lead {
  width: min(100%, 38rem);
  margin: 1.25rem auto 0;
  color: color-mix(in srgb, var(--ie-ink) 76%, transparent);
}
.ot-hero {
  display: grid;
  min-height: clamp(36rem, 92cqi, 52rem);
  align-items: center;
  gap: clamp(1.5rem, 5cqi, 3rem);
}
.ot-hero-copy { position: relative; z-index: 1; }
.ot-hero-copy > p:not(.ot-kicker) {
  max-width: 35rem;
  margin: 1.5rem 0 0;
  color: color-mix(in srgb, var(--ie-ink) 76%, transparent);
  font-size: clamp(1rem, 2.4cqi, 1.25rem);
}
.ot-hero-copy > time {
  display: block;
  margin-top: 1.6rem;
  color: var(--ie-ribbon);
  font-size: 0.75rem;
  font-weight: 760;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.ot-hero-photo {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}
.ot-media-placeholder {
  display: grid;
  min-height: 10rem;
  padding: 1rem;
  border: 1px dashed color-mix(in srgb, var(--ie-ribbon) 48%, transparent);
  color: color-mix(in srgb, var(--ie-ink) 66%, transparent);
  font-size: 0.76rem;
  place-items: center;
  text-align: center;
}
.ot-message { text-align: center; }
.ot-message-body {
  width: min(100%, 40rem);
  margin: 1.7rem auto 0;
  color: color-mix(in srgb, var(--ie-ink) 78%, transparent);
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.15rem, 3cqi, 1.6rem);
  line-height: 1.75;
}
.ot-signature {
  display: grid;
  gap: 0.2rem;
  margin-top: 2rem;
  justify-items: center;
}
.ot-signature span {
  color: color-mix(in srgb, var(--ie-ink) 74%, transparent);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.ot-signature strong {
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: 1.1rem;
  font-weight: 520;
}
.ot-countdown { text-align: center; }
.ot-countdown-grid {
  display: grid;
  width: min(100%, 36rem);
  margin: 2rem auto 0;
  grid-template-columns: repeat(4, 1fr);
}
.ot-countdown-grid span { padding: 0.75rem 0.35rem; }
.ot-countdown-grid strong,
.ot-countdown-grid small { display: block; }
.ot-countdown-grid strong {
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.8rem, 6cqi, 3.6rem);
  font-weight: 480;
  line-height: 1;
}
.ot-countdown-grid small {
  margin-top: 0.5rem;
  font-size: 0.62rem;
  font-weight: 760;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.ot-countdown > time {
  display: block;
  margin-top: 1.5rem;
  color: color-mix(in srgb, var(--ie-ink) 74%, transparent);
}
.ot-countdown-finished { margin: 1.5rem 0 0; }
.ot-event-details > h2,
.ot-participants > h2,
.ot-schedule > h2,
.ot-attire > h2,
.ot-gallery > h2,
.ot-guidance > h2,
.ot-gifts > h2,
.ot-rsvp > h2 { text-align: center; }
.ot-event-grid,
.ot-participant-grid,
.ot-attire-groups,
.ot-gallery-grid,
.ot-gift-list {
  display: grid;
  gap: clamp(1rem, 3cqi, 2rem);
  margin-top: clamp(2rem, 6cqi, 3.5rem);
}
.ot-event-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); }
.ot-event-grid article {
  min-width: 0;
  padding: clamp(1.25rem, 4cqi, 2rem);
}
.ot-event-grid article > time {
  display: block;
  color: var(--ie-ribbon);
  font-weight: 760;
}
.ot-event-grid article > h3 { margin-top: 1rem; }
.ot-event-grid article > address,
.ot-event-grid article > p:not(.ot-kicker) {
  margin: 0.75rem 0 0;
  color: color-mix(in srgb, var(--ie-ink) 72%, transparent);
}
.ot-event-grid article > a,
.ot-venue > a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  margin-top: 1rem;
  color: inherit;
  font-size: 0.75rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-underline-offset: 0.25rem;
  text-transform: uppercase;
}
.ot-participant-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
}
.ot-participant-grid article { min-width: 0; padding-block: 1.25rem; text-align: center; }
.ot-participant-grid ul,
.ot-guidance ul {
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}
.ot-participant-grid li + li { margin-top: 0.3rem; }
.ot-schedule ol {
  width: min(100%, 45rem);
  margin: 2.5rem auto 0;
  padding: 0;
  list-style: none;
}
.ot-schedule li {
  position: relative;
  display: grid;
  grid-template-columns: minmax(5rem, 8rem) 1fr;
  gap: 1.25rem;
  padding: 1.25rem 0;
  text-align: left;
}
.ot-schedule li > time {
  color: var(--ie-ribbon);
  font-size: 0.75rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ot-schedule li p {
  margin: 0.5rem 0 0;
  color: color-mix(in srgb, var(--ie-ink) 70%, transparent);
}
.ot-attire { text-align: center; }
.ot-color-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  margin: 2rem 0 0;
  padding: 0;
  list-style: none;
}
.ot-color-list li {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.6rem;
}
.ot-color-list span {
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid color-mix(in srgb, var(--ie-ink) 28%, transparent);
  border-radius: 50%;
}
.ot-attire-groups { grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); }
.ot-attire-groups article { padding: 1.25rem; }
.ot-attire-groups p { color: color-mix(in srgb, var(--ie-ink) 72%, transparent); }
.ot-gallery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ot-gallery-grid figure { min-width: 0; margin: 0; }
.ot-gallery-grid .ip-photo-trigger { display: block; min-height: 2.75rem; }
.ot-photo,
.ot-gift-photo {
  display: block;
  width: 100%;
  height: auto;
}
.ot-gallery-grid figcaption {
  display: grid;
  gap: 0.2rem;
  margin-top: 0.8rem;
}
.ot-gallery-grid figcaption span {
  color: color-mix(in srgb, var(--ie-ink) 68%, transparent);
  font-size: 0.88rem;
}
.ot-guidance ul {
  width: min(100%, 39rem);
  margin: 2rem auto 0;
}
.ot-guidance li {
  padding: 1rem 0;
  border-top: 1px solid color-mix(in srgb, var(--ie-ribbon) 28%, transparent);
}
.ot-gift-list { grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); }
.ot-gift-list article { min-width: 0; padding: 1.2rem; text-align: center; }
.ot-gift-list h3 { margin-top: 0.8rem; }
.ot-gift-list p { color: color-mix(in srgb, var(--ie-ink) 70%, transparent); }
.ot-rsvp {
  display: grid;
  justify-items: center;
  text-align: center;
}
.ot-rsvp > p { width: min(100%, 32rem); margin: 1.25rem 0 0; }
.ot-rsvp > time {
  margin-top: 0.8rem;
  color: var(--ie-ribbon);
  font-size: 0.75rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ot-rsvp-slot {
  min-width: 0;
  width: min(100%, 30rem);
  margin-top: 2rem;
}
.ot-footer {
  display: grid;
  justify-items: center;
  gap: 1rem;
  min-width: 0;
  padding: 3rem 1rem max(3rem, env(safe-area-inset-bottom));
  text-align: center;
}
.ot-rsvp-slot > * { min-width: 0; }
.ot-footer .ot-motif { width: 2.5rem; height: 2.5rem; }
.ot-motif {
  position: relative;
  display: inline-grid;
  width: clamp(4rem, 14cqi, 7rem);
  aspect-ratio: 1;
  place-items: center;
}
.ot-motif b {
  position: relative;
  z-index: 1;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1rem, 4cqi, 2.1rem);
  font-weight: 480;
}
.ot-motif i,
.ot-scene-decoration i { position: absolute; display: block; }
.ot-scene-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.ot-root .im-toggle {
  min-height: 2.75rem;
  padding: 0.55rem 0.9rem;
  border: 1px solid currentcolor;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ot-root .im-toggle:focus-visible,
.ot-root a:focus-visible,
.ot-root button:focus-visible {
  outline: 3px solid var(--ie-ribbon);
  outline-offset: 0.2rem;
}

/* Garden Promise — pressed garden folio. */
.ot-root[data-template="garden-promise"] {
  background:
    linear-gradient(90deg, transparent 0 4%, rgb(104 122 90 / 5%) 4% 4.2%, transparent 4.2%),
    var(--ie-background);
}
.ot-root[data-template="garden-promise"] .ot-content {
  border-inline: 1px solid color-mix(in srgb, var(--ie-ribbon) 20%, transparent);
  background: var(--ie-paper);
  box-shadow: 0 2rem 6rem rgb(52 64 51 / 9%);
}
.ot-root[data-template="garden-promise"] .ot-section + .ot-section {
  border-top: 1px solid color-mix(in srgb, var(--ie-ribbon) 22%, transparent);
}
.ot-root[data-template="garden-promise"] .ot-hero {
  grid-template-columns: minmax(0, 1.2fr) minmax(8rem, 0.8fr);
  padding-left: clamp(1.5rem, 11cqi, 7rem);
  text-align: left;
}
.ot-root[data-template="garden-promise"] .ot-hero > .ot-motif {
  grid-column: 2;
  grid-row: 1;
  width: min(100%, 18rem);
  justify-self: center;
}
.ot-root[data-template="garden-promise"] .ot-hero-copy { grid-column: 1; grid-row: 1; }
.ot-root[data-template="garden-promise"] .ot-motif[data-motif="garden-promise"] i {
  width: 36%;
  height: 70%;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 60%, transparent);
  border-radius: 100% 0 100% 0;
  transform-origin: 50% 100%;
}
.ot-root[data-template="garden-promise"] .ot-motif[data-motif="garden-promise"] i:nth-of-type(1) {
  transform: translate(-44%, 3%) rotate(-38deg);
}
.ot-root[data-template="garden-promise"] .ot-motif[data-motif="garden-promise"] i:nth-of-type(2) {
  transform: translate(38%, -8%) rotate(35deg) scale(0.82);
}
.ot-root[data-template="garden-promise"] .ot-motif[data-motif="garden-promise"] i:nth-of-type(3) {
  width: 1px;
  height: 90%;
  border: 0;
  border-left: 1px solid var(--ie-ribbon);
  border-radius: 0;
  transform: rotate(8deg);
}
.ot-root[data-template="garden-promise"] .ot-message {
  padding-inline: clamp(2rem, 15cqi, 10rem);
}
.ot-root[data-template="garden-promise"] .ot-event-grid { gap: 0; }
.ot-root[data-template="garden-promise"] .ot-event-grid article {
  border-block: 1px solid color-mix(in srgb, var(--ie-ribbon) 30%, transparent);
}
.ot-root[data-template="garden-promise"] .ot-event-grid article + article {
  border-left: 1px solid color-mix(in srgb, var(--ie-ribbon) 30%, transparent);
}
.ot-root[data-template="garden-promise"] .ot-participant-grid article {
  border-top: 1px solid color-mix(in srgb, var(--ie-ribbon) 28%, transparent);
}
.ot-root[data-template="garden-promise"] .ot-schedule ol {
  padding-left: 1.5rem;
  border-left: 1px solid var(--ie-ribbon);
}
.ot-root[data-template="garden-promise"] .ot-schedule li::before {
  position: absolute;
  top: 1.45rem;
  left: -1.83rem;
  width: 0.62rem;
  height: 0.62rem;
  border: 1px solid var(--ie-ribbon);
  border-radius: 50%;
  background: var(--ie-paper);
  content: "";
}
.ot-root[data-template="garden-promise"] .ot-rsvp {
  background: color-mix(in srgb, var(--ie-ribbon) 13%, var(--ie-paper));
}
.ot-root[data-template="garden-promise"] .ot-rsvp-slot {
  padding: 1.25rem;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 42%, transparent);
}

/* Golden Hour — midnight ballroom program. */
.ot-root[data-template="golden-hour"] {
  background:
    linear-gradient(135deg, transparent 48%, rgb(211 173 96 / 7%) 49% 51%, transparent 52%),
    var(--ie-background);
}
.ot-root[data-template="golden-hour"] .ot-content {
  color: var(--ie-ink);
  counter-reset: golden-page;
}
.ot-root[data-template="golden-hour"] .ot-section {
  counter-increment: golden-page;
  border-inline: 1px solid color-mix(in srgb, var(--ie-ribbon) 28%, transparent);
}
.ot-root[data-template="golden-hour"] .ot-section::before {
  position: absolute;
  top: 1.5rem;
  left: 50%;
  color: color-mix(in srgb, var(--ie-ribbon) 74%, transparent);
  content: counter(golden-page, decimal-leading-zero);
  font-size: 0.62rem;
  font-weight: 760;
  letter-spacing: 0.18em;
  transform: translateX(-50%);
}
.ot-root[data-template="golden-hour"] .ot-section + .ot-section {
  border-top: 1px solid color-mix(in srgb, var(--ie-ribbon) 32%, transparent);
}
.ot-root[data-template="golden-hour"] .ot-hero {
  min-height: clamp(40rem, 100cqi, 58rem);
  padding: clamp(5rem, 12cqi, 8rem);
  text-align: center;
  place-items: center;
}
.ot-root[data-template="golden-hour"] .ot-hero-copy { max-width: 46rem; }
.ot-root[data-template="golden-hour"] .ot-hero-copy > p,
.ot-root[data-template="golden-hour"] .ot-hero-copy > time { margin-inline: auto; }
.ot-root[data-template="golden-hour"] .ot-hero > .ot-motif {
  position: absolute;
  width: min(68cqi, 31rem);
  opacity: 0.24;
}
.ot-root[data-template="golden-hour"] .ot-motif[data-motif="golden-hour"] {
  border: 1px solid var(--ie-ribbon);
  transform: rotate(45deg);
}
.ot-root[data-template="golden-hour"] .ot-motif[data-motif="golden-hour"]::before,
.ot-root[data-template="golden-hour"] .ot-motif[data-motif="golden-hour"]::after {
  position: absolute;
  inset: 10%;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 66%, transparent);
  content: "";
}
.ot-root[data-template="golden-hour"] .ot-motif[data-motif="golden-hour"]::after {
  inset: 25%;
  border-radius: 50%;
}
.ot-root[data-template="golden-hour"] .ot-motif[data-motif="golden-hour"] b {
  transform: rotate(-45deg);
}
.ot-root[data-template="golden-hour"] .ot-message {
  display: grid;
  grid-template-columns: minmax(12rem, 0.8fr) minmax(0, 1.2fr);
  align-items: start;
  text-align: left;
}
.ot-root[data-template="golden-hour"] .ot-message-body { margin: 0; }
.ot-root[data-template="golden-hour"] .ot-signature {
  grid-column: 2;
  justify-items: start;
}
.ot-root[data-template="golden-hour"] .ot-event-grid article,
.ot-root[data-template="golden-hour"] .ot-participant-grid article,
.ot-root[data-template="golden-hour"] .ot-gift-list article {
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 38%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--ie-paper) 72%, var(--ie-background));
}
.ot-root[data-template="golden-hour"] .ot-schedule ol {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-block: 1px solid color-mix(in srgb, var(--ie-ribbon) 34%, transparent);
}
.ot-root[data-template="golden-hour"] .ot-schedule li {
  padding: 1.4rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ie-ribbon) 20%, transparent);
}
.ot-root[data-template="golden-hour"] .ot-rsvp {
  margin: clamp(1rem, 4cqi, 3rem);
  border: 1px solid var(--ie-ribbon);
  outline: 1px solid color-mix(in srgb, var(--ie-ribbon) 45%, transparent);
  outline-offset: -0.65rem;
}
.ot-root[data-template="golden-hour"] .ot-rsvp-slot {
  padding: 1.25rem;
  border-top: 1px solid color-mix(in srgb, var(--ie-ribbon) 42%, transparent);
}
.ot-root[data-template="golden-hour"] .ip-photo-sheet {
  border-radius: 0;
}

/* Sunday Joy — sunlit cut-paper party book. */
.ot-root[data-template="sunday-joy"] {
  background:
    radial-gradient(circle at 8% 12%, rgb(121 185 212 / 24%) 0 4rem, transparent 4.1rem),
    radial-gradient(circle at 94% 30%, rgb(221 101 76 / 18%) 0 5rem, transparent 5.1rem),
    var(--ie-background);
}
.ot-root[data-template="sunday-joy"] .ot-content { padding-block: clamp(1rem, 4cqi, 3rem); }
.ot-root[data-template="sunday-joy"] .ot-section {
  width: min(calc(100% - clamp(1rem, 5cqi, 3rem)), 58rem);
  margin-inline: auto;
  border: 2px solid color-mix(in srgb, var(--ie-ink) 14%, transparent);
  border-radius: clamp(1.25rem, 5cqi, 3.5rem);
  background: var(--ie-paper);
  box-shadow: 0.55rem 0.65rem 0 color-mix(in srgb, var(--ie-ribbon) 18%, transparent);
}
.ot-root[data-template="sunday-joy"] .ot-section + .ot-section {
  margin-top: clamp(1.5rem, 5cqi, 3.5rem);
}
.ot-root[data-template="sunday-joy"] .ot-section:nth-child(even) {
  transform: translateX(clamp(-0.8rem, -1.5cqi, -0.2rem)) rotate(-0.35deg);
}
.ot-root[data-template="sunday-joy"] .ot-section:nth-child(odd) {
  transform: translateX(clamp(0.2rem, 1.5cqi, 0.8rem)) rotate(0.35deg);
}
.ot-root[data-template="sunday-joy"] .ot-hero {
  overflow: hidden;
  grid-template-columns: minmax(0, 1fr) minmax(7rem, 0.5fr);
  text-align: left;
}
.ot-root[data-template="sunday-joy"] .ot-hero-copy { grid-column: 1; grid-row: 1; }
.ot-root[data-template="sunday-joy"] .ot-hero > .ot-motif {
  grid-column: 2;
  grid-row: 1;
  width: min(100%, 16rem);
}
.ot-root[data-template="sunday-joy"] .ot-motif[data-motif="sunday-joy"] {
  border: 1rem solid #f6c94c;
  border-radius: 50%;
  background: var(--ie-paper);
  box-shadow:
    0 -3.2rem 0 -3rem #dd654c,
    0 3.2rem 0 -3rem #79b9d4,
    3.2rem 0 0 -3rem #dd654c,
    -3.2rem 0 0 -3rem #79b9d4;
}
.ot-root[data-template="sunday-joy"] .ot-event-grid article {
  border: 2px dashed color-mix(in srgb, var(--ie-ribbon) 46%, transparent);
  border-radius: 1.2rem;
}
.ot-root[data-template="sunday-joy"] .ot-schedule ol {
  padding-left: 1.5rem;
  border-left: 0.35rem dotted #79b9d4;
}
.ot-root[data-template="sunday-joy"] .ot-schedule li::before {
  position: absolute;
  top: 1.35rem;
  left: -2rem;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--ie-ribbon);
  content: "";
}
.ot-root[data-template="sunday-joy"] .ot-gallery-grid figure:nth-child(3n + 1) {
  grid-column: span 2;
}
.ot-root[data-template="sunday-joy"] .ot-guidance li {
  border-top-style: dashed;
}
.ot-root[data-template="sunday-joy"] .ot-rsvp {
  background: color-mix(in srgb, var(--ie-ribbon) 16%, var(--ie-paper));
}
.ot-root[data-template="sunday-joy"] .ot-rsvp-slot {
  padding: 1.25rem;
  border: 2px dashed color-mix(in srgb, var(--ie-ribbon) 52%, transparent);
  border-radius: 1.25rem;
}

@container (max-width: 36rem) {
  .ot-section { padding: 3.75rem 1.25rem; }
  .ot-rsvp-slot { padding-inline: 0.5rem !important; }
  .ot-countdown-grid strong { font-size: clamp(1.5rem, 10cqi, 2.5rem); }
  .ot-countdown-grid small { font-size: 0.55rem; letter-spacing: 0.06em; }
  .ot-schedule li { grid-template-columns: 5rem 1fr; gap: 0.75rem; }
  .ot-gallery-grid { grid-template-columns: 1fr; }
  .ot-root[data-template="garden-promise"] .ot-hero,
  .ot-root[data-template="sunday-joy"] .ot-hero {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .ot-root[data-template="garden-promise"] .ot-hero > .ot-motif,
  .ot-root[data-template="sunday-joy"] .ot-hero > .ot-motif {
    grid-column: 1;
    grid-row: 1;
    width: 8rem;
  }
  .ot-root[data-template="garden-promise"] .ot-hero-copy,
  .ot-root[data-template="sunday-joy"] .ot-hero-copy { grid-column: 1; grid-row: 2; }
  .ot-root[data-template="garden-promise"] .ot-hero-copy > p,
  .ot-root[data-template="garden-promise"] .ot-hero-copy > time,
  .ot-root[data-template="sunday-joy"] .ot-hero-copy > p,
  .ot-root[data-template="sunday-joy"] .ot-hero-copy > time { margin-inline: auto; }
  .ot-root[data-template="garden-promise"] .ot-event-grid article + article {
    border-top: 0;
    border-left: 0;
  }
  .ot-root[data-template="golden-hour"] .ot-message { display: block; text-align: center; }
  .ot-root[data-template="golden-hour"] .ot-message-body { margin: 1.5rem auto 0; }
  .ot-root[data-template="golden-hour"] .ot-signature {
    grid-column: auto;
    justify-items: center;
  }
  .ot-root[data-template="golden-hour"] .ot-schedule ol { grid-template-columns: 1fr; }
  .ot-root[data-template="sunday-joy"] .ot-section,
  .ot-root[data-template="sunday-joy"] .ot-section:nth-child(even),
  .ot-root[data-template="sunday-joy"] .ot-section:nth-child(odd) {
    transform: none;
  }
  .ot-root[data-template="sunday-joy"] .ot-gallery-grid figure:nth-child(3n + 1) {
    grid-column: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ot-root *,
  .ot-root *::before,
  .ot-root *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
