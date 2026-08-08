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
  OccasionEnvelopeAddress,
  OccasionEnvelopeClosure,
  OccasionEnvelopeCoverMark,
  OccasionEnvelopeLetterMark,
  occasionEnvelopeStyles,
} from "./OccasionEnvelope.js";
import {
  largestImageRendition,
  PhotoPreviewDialog,
  type PhotoPreviewItem,
  PhotoPreviewTrigger,
  photoPreviewStyles,
} from "./PhotoPreview.js";
import { PoweredByInvitica, poweredByInviticaStyles } from "./PoweredByInvitica.js";
import {
  RibbonEnvelopeOpening,
  type RibbonEnvelopeVariant,
  ribbonEnvelopeStyles,
} from "./RibbonEnvelopeOpening.js";
import { RomanticResponsePreview } from "./RomanticResponse.js";
import { isSectionVisibleToAudience } from "./sectionVisibility.js";
import { useCountdown } from "./useCountdown.js";

export type OccasionTemplateVariant =
  | "garden-promise"
  | "golden-hour"
  | "little-question"
  | "sunday-joy";

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
  "little-question": {
    kicker: "A little question is waiting",
    letterLead: "Just for",
    letterNote: "Open when you are ready",
    recipientLead: "Made especially for",
    variant: "little-question",
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

/**
 * A pressed sprig: one stem, four alternating leaves, and a closed bud. Drawn as a single inline SVG
 * rather than rotated CSS boxes so the silhouette reads as a botanical specimen at 8rem on a phone
 * instead of three stray strokes.
 */
function GardenSprig() {
  return (
    <svg aria-hidden="true" className="ot-sprig" focusable="false" viewBox="0 0 100 150">
      <path className="ot-sprig-stem" d="M50 148C49 120 51 96 50 72 49 48 51 30 50 12" />
      <path d="M50 113c12-2 26-12 34-28-16 0-30 12-34 28Z" />
      <path d="M50 93c-12-2-26-12-34-28 16 0 30 10 34 28Z" />
      <path d="M50 69c11-2 23-11 30-22-14 0-26 9-30 22Z" />
      <path d="M50 49c-10-2-21-9-28-18 13-1 24 7 28 18Z" />
      <ellipse cx="50" cy="15" rx="5" ry="9" />
    </svg>
  );
}

function LittleQuestionStampArtwork() {
  return (
    <svg aria-hidden="true" className="ot-lq-stamp-art" focusable="false" viewBox="0 0 100 100">
      <path
        className="ot-lq-stamp-edge"
        d="M12 22v-8h8l4-5 7 3 6-4 6 4 7-3 7 3 6-4 6 4 7-3 4 5h8v8l5 4-3 7 4 6-4 6 3 7-3 7 4 6-5 4v8h-8l-4 5-7-3-6 4-6-4-7 3-7-3-6 4-6-4-7 3-4-5h-8v-8l-5-4 3-7-4-6 4-6-3-7 3-7-4-6 5-4Z"
      />
      <circle className="ot-lq-stamp-ring" cx="50" cy="50" r="31" />
      <path
        className="ot-lq-stamp-heart"
        d="M50 70C42 63 30 54 30 43c0-11 14-14 20-4 6-10 20-7 20 4 0 11-12 20-20 27Z"
      />
    </svg>
  );
}

function LittleQuestionPaperArtwork({ context }: { context: "hero" | "rsvp" }) {
  return (
    <svg
      aria-hidden="true"
      className={
        context === "hero"
          ? "ot-lq-paper-art ot-lq-paper-art--hero"
          : "ot-lq-paper-art ot-lq-paper-art--rsvp"
      }
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <path className="ot-lq-paper-fold" d="M0 13h18L27 0M100 87H82l-9 13" />
      <path className="ot-lq-paper-stitch" d="M4 22V4h18M96 78v18H78" />
      <path
        className="ot-lq-paper-heart"
        d="M12 82c2-3 7-2 7 2 0 3-4 5-7 8-3-3-7-5-7-8 0-4 5-5 7-2Zm78-68c2-3 7-2 7 2 0 3-4 5-7 8-3-3-7-5-7-8 0-4 5-5 7-2Z"
      />
      {context === "rsvp" ? (
        <path className="ot-lq-paper-perforation" d="M6 31h88M6 74h88" />
      ) : null}
    </svg>
  );
}

function LittleQuestionReplyMark() {
  return (
    <svg
      aria-hidden="true"
      className="ot-rsvp-mark ot-lq-reply-mark"
      focusable="false"
      viewBox="0 0 96 48"
    >
      <path className="ot-lq-reply-line" d="M2 24h25m42 0h25" />
      <path
        className="ot-lq-reply-heart"
        d="M48 40C40 33 30 26 30 16 30 6 42 3 48 12 54 3 66 6 66 16c0 10-10 17-18 24Z"
      />
    </svg>
  );
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
      {/* The numeral is set only where the medallion is small and fully opaque. Behind hero type the
          medallion sits at 24%, and a text-shaped mark at that opacity reads as a grey artifact the
          eye keeps trying to resolve. The hero watermark is the diamond geometry alone. */}
      {variant === "golden-hour" && context !== "hero" ? <b>XVIII</b> : null}
      {variant === "little-question" ? (
        <>
          <LittleQuestionStampArtwork />
          <b>?</b>
        </>
      ) : null}
      {variant === "garden-promise" ? (
        <GardenSprig />
      ) : variant === "golden-hour" || variant === "sunday-joy" ? (
        <>
          <i />
          <i />
          <i />
        </>
      ) : null}
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
          data-has-image={Boolean(section.props.imageAssetId)}
          data-section-type={section.type}
          key={section.id}
        >
          {variant === "little-question" ? <LittleQuestionPaperArtwork context="hero" /> : null}
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
              <div aria-hidden="true" className="ot-media-placeholder ot-hero-placeholder">
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
          {variant === "little-question" ? (
            <>
              <LittleQuestionPaperArtwork context="rsvp" />
              <LittleQuestionReplyMark />
            </>
          ) : (
            <span aria-hidden="true" className="ot-rsvp-mark" />
          )}
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          {section.props.message ? <p>{section.props.message}</p> : null}
          {section.props.deadline ? (
            <time dateTime={section.props.deadline}>
              {formatDeadline(section.props.deadline, document.locale, document.eventTimezone)}
            </time>
          ) : null}
          <div className="ot-rsvp-slot" data-rsvp-slot="true">
            {rsvpSlot ??
              (mode === "preview" && "responseMode" in section.props ? (
                <RomanticResponsePreview
                  declineButtonBehavior={section.props.declineButtonBehavior}
                  reducedMotion={reducedMotion}
                />
              ) : (
                <span>
                  {mode === "preview"
                    ? "Response form appears here after publication."
                    : "Open your personal invitation link to respond."}
                </span>
              ))}
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
        coverMark={<OccasionEnvelopeCoverMark variant={variant} />}
        frontMark={<OccasionEnvelopeAddress recipient={recipient} variant={variant} />}
        includeStyles={false}
        kicker={profile.kicker}
        letterMark={<OccasionEnvelopeLetterMark variant={variant} />}
        letterLead={profile.letterLead}
        letterNote={profile.letterNote}
        mode={mode}
        onOpeningStateChange={onOpeningStateChange}
        openingReplayKey={openingReplayKey}
        pace="deliberate"
        recipient={recipient}
        recipientLead={profile.recipientLead}
        reducedMotion={reducedMotion}
        ribbonKnot={<OccasionEnvelopeClosure variant={variant} />}
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

/**
 * The shared envelope stylesheet is inlined here rather than emitted by `RibbonEnvelopeOpening`
 * (`includeStyles={false}`) so the occasion envelope rules that follow it win on cascade order as
 * well as specificity. Garden Promise v1 already loads its own envelope styles the same way.
 */
const occasionTemplateStyles = `
${ribbonEnvelopeStyles}
${occasionEnvelopeStyles}
${interactiveMapStyles}
${photoPreviewStyles}
${poweredByInviticaStyles}
.ot-root {
  /* Accent mixed toward the document ink. Raw --ie-ribbon is chosen for rules, the ribbon, and
     focus outlines, and falls below 4.5:1 as small text on the lighter template palettes. */
  --ie-ribbon-text: color-mix(in srgb, var(--ie-ribbon) 70%, var(--ie-ink));
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
  color: var(--ie-ribbon-text);
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
  color: var(--ie-ribbon-text);
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
  color: color-mix(in srgb, var(--ie-ink) 74%, transparent);
  font-size: 0.76rem;
  place-items: center;
  text-align: center;
}
/* An album slot reserves the space a photograph will actually take. At album width the shared 10rem
   minimum is a 2.4:1 bar that reads as a divider between captions rather than a missing picture. All
   three occasions share the proportion; only a slot that spans both columns overrides it. */
.ot-gallery-grid .ot-media-placeholder {
  min-height: 0;
  aspect-ratio: 4 / 3;
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
  font-variant-numeric: tabular-nums;
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
  color: var(--ie-ribbon-text);
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
  color: var(--ie-ribbon-text);
  font-size: 0.75rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ot-schedule li p {
  margin: 0.5rem 0 0;
  color: color-mix(in srgb, var(--ie-ink) 74%, transparent);
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
  color: color-mix(in srgb, var(--ie-ink) 74%, transparent);
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
.ot-gift-list p { color: color-mix(in srgb, var(--ie-ink) 74%, transparent); }
.ot-rsvp {
  display: grid;
  justify-items: center;
  text-align: center;
}
.ot-rsvp > p { width: min(100%, 32rem); margin: 1.25rem 0 0; }
.ot-rsvp > time {
  margin-top: 0.8rem;
  color: var(--ie-ribbon-text);
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

/* Every occasion honors the section presets its invitation document already stores. Enhancement
   only: without view timelines, with reduced motion, or for the "fade-in", "none", and
   "stagger-children" presets, every section renders in its end state.

   These reveals move but never fade. A scroll-linked opacity ramp is a state the guest can stop
   inside, and on the Garden Promise palette a section at 86% opacity drops the message body to
   4.12:1 — below AA. Transform-only keeps every character at full contrast on every frame, so
   "fade-in" has nothing safe to animate and stays inert.

   Amplitude is shared; each occasion sets its own pace through --ot-reveal-range, which is how long
   a section takes to arrive as it enters. The keyframe values stay literal so the transforms remain
   compositable on a mid-range phone; only the range, which is not an animated property, is a token. */
.ot-root { --ot-reveal-range: 20%; }
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .ot-root[data-motion-enabled="true"] .ot-section[data-animation="fade-up"],
    .ot-root[data-motion-enabled="true"] .ot-section[data-animation="scale-in"] {
      animation-fill-mode: both;
      animation-timing-function: linear;
      animation-timeline: view();
      animation-range: cover 0% cover var(--ot-reveal-range);
    }
    .ot-root[data-motion-enabled="true"] .ot-section[data-animation="fade-up"] {
      animation-name: ot-rise;
    }
    .ot-root[data-motion-enabled="true"] .ot-section[data-animation="scale-in"] {
      animation-name: ot-settle;
    }
  }
}
@keyframes ot-rise {
  from { transform: translateY(1.25rem); }
}
@keyframes ot-settle {
  from { transform: scale(0.975); }
}

/* Garden Promise — pressed garden folio.

   The sheet is the concept: laid paper resting on a surface, carrying a mounted specimen and a
   printed left reading edge. Type is set apart from the other occasions through the Fraunces WONK
   axis and a quieter heading scale, not through color alone. */
.ot-root[data-template="garden-promise"] {
  background:
    radial-gradient(120% 55% at 50% 0%, rgb(255 255 255 / 30%), transparent 62%),
    var(--ie-background);
}
.ot-root[data-template="garden-promise"] .ot-content {
  border-inline: 1px solid color-mix(in srgb, var(--ie-ribbon) 20%, transparent);
  /* Handmade paper tone. Three soft washes rather than ruled lines: hard 1px repeats band visibly
     on a sheet this tall and read as grid paper instead of stock. All are far below text contrast. */
  background:
    radial-gradient(
      62% 26% at 16% 9%,
      color-mix(in srgb, var(--ie-ink) 3%, transparent),
      transparent 72%
    ),
    radial-gradient(
      54% 22% at 84% 46%,
      color-mix(in srgb, var(--ie-ink) 2.5%, transparent),
      transparent 72%
    ),
    radial-gradient(
      70% 30% at 38% 86%,
      color-mix(in srgb, var(--ie-ink) 2.5%, transparent),
      transparent 74%
    ),
    var(--ie-paper);
  /* A tight contact shadow plus the wide ambient one, so the column reads as a sheet with weight. */
  box-shadow:
    0 0.1rem 0.4rem rgb(52 64 51 / 10%),
    0 2rem 6rem rgb(52 64 51 / 13%);
}
.ot-root[data-template="garden-promise"] .ot-section + .ot-section {
  border-top: 1px solid color-mix(in srgb, var(--ie-ribbon) 22%, transparent);
}

/* Type: WONK on display faces, and a heading scale that lets the couple's names lead. */
.ot-root[data-template="garden-promise"] .ot-section h1,
.ot-root[data-template="garden-promise"] .ot-section h2,
.ot-root[data-template="garden-promise"] .ot-section h3,
.ot-root[data-template="garden-promise"] .ot-message-body,
.ot-root[data-template="garden-promise"] .ot-signature strong,
.ot-root[data-template="garden-promise"] .ot-countdown-grid strong {
  font-variation-settings: "WONK" 1;
}
.ot-root[data-template="garden-promise"] .ot-section h1 { font-weight: 430; }
.ot-root[data-template="garden-promise"] .ot-section h2 {
  font-size: clamp(1.6rem, 4.3cqi, 2.85rem);
  font-weight: 430;
  letter-spacing: -0.022em;
}

/* A printed left reading edge: a short rule above each flush-left heading. The message, countdown,
   attire and reply sections stay centered on purpose — they are the moments, not the reference. */
.ot-root[data-template="garden-promise"] .ot-event-details > h2,
.ot-root[data-template="garden-promise"] .ot-participants > h2,
.ot-root[data-template="garden-promise"] .ot-schedule > h2,
.ot-root[data-template="garden-promise"] .ot-gallery > h2,
.ot-root[data-template="garden-promise"] .ot-guidance > h2,
.ot-root[data-template="garden-promise"] .ot-gifts > h2 {
  position: relative;
  padding-top: 1.4rem;
  text-align: left;
}
.ot-root[data-template="garden-promise"] .ot-event-details > h2::before,
.ot-root[data-template="garden-promise"] .ot-participants > h2::before,
.ot-root[data-template="garden-promise"] .ot-schedule > h2::before,
.ot-root[data-template="garden-promise"] .ot-gallery > h2::before,
.ot-root[data-template="garden-promise"] .ot-guidance > h2::before,
.ot-root[data-template="garden-promise"] .ot-gifts > h2::before {
  position: absolute;
  top: 0;
  left: 0;
  width: 2.5rem;
  border-top: 1px solid var(--ie-ribbon);
  content: "";
}
.ot-root[data-template="garden-promise"] .ot-section-lead { margin-inline: 0; }
.ot-root[data-template="garden-promise"] .ot-attire .ot-section-lead,
.ot-root[data-template="garden-promise"] .ot-message .ot-section-lead { margin-inline: auto; }

/* Rhythm: the reference sections sit tighter than the two that carry the occasion. */
.ot-root[data-template="garden-promise"] .ot-countdown,
.ot-root[data-template="garden-promise"] .ot-attire,
.ot-root[data-template="garden-promise"] .ot-guidance {
  padding-block: clamp(2.75rem, 7cqi, 5rem);
}
.ot-root[data-template="garden-promise"] .ot-message,
.ot-root[data-template="garden-promise"] .ot-rsvp {
  padding-block: clamp(4.5rem, 13cqi, 9rem);
}

/* The mounted specimen. */
.ot-root[data-template="garden-promise"] .ot-motif { color: var(--ie-ribbon); }
.ot-root[data-template="garden-promise"] .ot-sprig {
  display: block;
  width: 100%;
  height: 100%;
  fill: color-mix(in srgb, currentcolor 15%, transparent);
  stroke: currentcolor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ot-root[data-template="garden-promise"] .ot-sprig-stem { fill: none; }
/* On the closed envelope the sprig lies across the flap so its leaves read on both sides of the
   vertical ribbon. Standing upright it disappeared behind the knot. */
.ot-root[data-template="garden-promise"] .ot-motif[data-context="cover"] {
  width: clamp(7rem, 30cqi, 10rem);
  aspect-ratio: 3 / 2;
}
.ot-root[data-template="garden-promise"] .ot-motif[data-context="cover"] .ot-sprig {
  width: auto;
  height: 100%;
  fill: color-mix(in srgb, currentcolor 22%, transparent);
  stroke-width: 2;
  transform: rotate(-90deg);
}
.ot-root[data-template="garden-promise"] .ot-footer .ot-motif {
  width: 1.7rem;
  height: 2.55rem;
}
.ot-root[data-template="garden-promise"] .ot-hero {
  min-height: clamp(30rem, 78cqi, 44rem);
  grid-template-columns: minmax(0, 1.25fr) minmax(7rem, 0.75fr);
  padding-left: clamp(1.5rem, 11cqi, 7rem);
  text-align: left;
}
.ot-root[data-template="garden-promise"] .ot-hero > .ot-motif {
  grid-column: 2;
  grid-row: 1;
  width: min(100%, 13rem);
  aspect-ratio: 2 / 3;
  justify-self: center;
}
.ot-root[data-template="garden-promise"] .ot-hero-copy {
  grid-column: 1;
  grid-row: 1 / span 2;
  align-self: center;
}
/* The couple's portrait is mounted as a plate under the specimen rather than left to auto-flow into
   a banner beneath the names. Only the empty slot is held to portrait proportion; a real photograph
   keeps its own aspect ratio inside the same mount, so nothing is cropped. */
.ot-root[data-template="garden-promise"] .ot-hero-photo,
.ot-root[data-template="garden-promise"] .ot-hero-placeholder {
  grid-column: 2;
  grid-row: 2;
  width: min(100%, 13rem);
  padding: 0.45rem;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 32%, transparent);
  background: var(--ie-paper);
  box-shadow: 0 0.35rem 1.2rem rgb(52 64 51 / 10%);
  align-self: start;
  justify-self: center;
}
.ot-root[data-template="garden-promise"] .ot-hero-placeholder {
  min-height: 0;
  aspect-ratio: 4 / 5;
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
/* The entourage reads as a printed roll rather than ten islands: one flowing two-column list with
   a rule between columns, group labels set as small caps, and no group ever split across a column. */
.ot-root[data-template="garden-promise"] .ot-participant-grid {
  display: block;
  columns: 2;
  column-gap: clamp(1.5rem, 5cqi, 3.25rem);
  column-rule: 1px solid color-mix(in srgb, var(--ie-ribbon) 20%, transparent);
}
.ot-root[data-template="garden-promise"] .ot-participant-grid article {
  padding-block: 0 1.4rem;
  break-inside: avoid;
  text-align: left;
}
.ot-root[data-template="garden-promise"] .ot-participant-grid h3 {
  color: var(--ie-ribbon-text);
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
  font-size: 0.68rem;
  font-variation-settings: normal;
  font-weight: 760;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.ot-root[data-template="garden-promise"] .ot-participant-grid ul { margin-top: 0.55rem; }

/* Attire swatches read as paint-card chips instead of generic dots. */
.ot-root[data-template="garden-promise"] .ot-color-list li {
  flex-direction: column;
  gap: 0.55rem;
  font-size: 0.68rem;
  font-weight: 760;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.ot-root[data-template="garden-promise"] .ot-color-list span {
  width: 2.4rem;
  height: 3.2rem;
  border: 1px solid color-mix(in srgb, var(--ie-ink) 26%, transparent);
  border-radius: 0;
}

/* Guidance items carry a small leaf mark, so the botanical vocabulary appears in the reference
   sections and not only on the hero. */
.ot-root[data-template="garden-promise"] .ot-guidance li {
  position: relative;
  padding-left: 1.85rem;
}
.ot-root[data-template="garden-promise"] .ot-guidance li::before {
  position: absolute;
  top: 1.35rem;
  left: 0.1rem;
  width: 0.78rem;
  height: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 70%, transparent);
  border-radius: 100% 0 100% 0;
  background: color-mix(in srgb, var(--ie-ribbon) 18%, transparent);
  content: "";
}

/* The countdown becomes one ruled block instead of four floating numerals. */
.ot-root[data-template="garden-promise"] .ot-countdown-grid {
  border-block: 1px solid color-mix(in srgb, var(--ie-ribbon) 30%, transparent);
}
.ot-root[data-template="garden-promise"] .ot-countdown-grid span + span {
  border-left: 1px solid color-mix(in srgb, var(--ie-ribbon) 20%, transparent);
}
.ot-root[data-template="garden-promise"] .ot-countdown-grid strong { font-weight: 400; }

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
/* The signature moment: once the envelope clears, the specimen settles onto the sheet and its
   shadow blooms then tightens, as though it were just pressed. It runs once, on one decorative
   element, and never touches text. The resting state is the element's default, so if the animation
   never runs — no support, reduced motion, no hydration — the sprig is simply already in place. */
@media (prefers-reduced-motion: no-preference) {
  .ot-root[data-template="garden-promise"]
    .ie-root[data-motion-enabled="true"][data-opening-state="opened"]
    .ot-motif[data-context="hero"]
    .ot-sprig {
    animation: ot-sprig-settle 720ms cubic-bezier(0.22, 0.72, 0.24, 1) both;
  }
}
@keyframes ot-sprig-settle {
  0% {
    transform: translateY(-1.05rem) rotate(-3deg);
    filter: drop-shadow(0 0.7rem 0.55rem color-mix(in srgb, var(--ie-ink) 20%, transparent));
  }
  62% {
    transform: translateY(0.1rem) rotate(0.5deg);
    filter: drop-shadow(0 0.12rem 0.18rem color-mix(in srgb, var(--ie-ink) 15%, transparent));
  }
  100% {
    transform: none;
    filter: drop-shadow(0 0.04rem 0.09rem color-mix(in srgb, var(--ie-ink) 10%, transparent));
  }
}

/* Golden Hour — midnight ballroom program. */
.ot-root[data-template="golden-hour"] {
  /* Deliberate pace: sections arrive over 30% of their entrance, the slowest of the three. */
  --ot-reveal-range: 30%;
  background: var(--ie-background);
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
/* The debutante's portrait is the program's frontispiece: a plate above her name, in the same brass
   double rule the reply card uses. The medallion stays behind it as a watermark. Only the empty slot
   is held to portrait proportion; a real photograph keeps its own aspect ratio inside the same
   mount, so nothing is cropped. */
.ot-root[data-template="golden-hour"] .ot-hero-photo,
.ot-root[data-template="golden-hour"] .ot-hero-placeholder {
  width: min(100%, 14rem);
  padding: 0.4rem;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 55%, transparent);
  outline: 1px solid color-mix(in srgb, var(--ie-ribbon) 30%, transparent);
  outline-offset: 0.35rem;
  background: color-mix(in srgb, var(--ie-paper) 72%, var(--ie-background));
}
.ot-root[data-template="golden-hour"] .ot-hero-placeholder {
  min-height: 0;
  aspect-ratio: 4 / 5;
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

/* A Little Question: hand-finished correspondence with folded paper and postal linework. */
.ot-root[data-template="little-question"] {
  --ot-reveal-range: 18%;
  background:
    radial-gradient(circle at 7% 14%, color-mix(in srgb, var(--ie-ribbon) 10%, transparent) 0 4.5rem, transparent 4.6rem),
    radial-gradient(circle at 96% 68%, color-mix(in srgb, var(--ie-ribbon) 8%, transparent) 0 6.5rem, transparent 6.6rem),
    var(--ie-background);
}
.ot-root[data-template="little-question"] .ot-content {
  width: min(100%, 62rem);
  padding: clamp(0.75rem, 2.8cqi, 1.75rem);
}
.ot-root[data-template="little-question"] .ot-section {
  margin-block: clamp(0.75rem, 2.8cqi, 1.75rem);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 28%, transparent);
  border-radius: 0.35rem;
  background:
    radial-gradient(90% 72% at 8% 4%, rgb(255 255 255 / 48%), transparent 68%),
    linear-gradient(105deg, color-mix(in srgb, var(--ie-ribbon) 4%, transparent), transparent 42%),
    var(--ie-paper);
  box-shadow:
    0.48rem 0.58rem 0 color-mix(in srgb, var(--ie-ribbon) 13%, transparent),
    0 1.2rem 2.8rem color-mix(in srgb, var(--ie-ink) 7%, transparent);
}
.ot-root[data-template="little-question"] .ot-section:nth-child(even) { transform: rotate(0.35deg); }
.ot-root[data-template="little-question"] .ot-section:nth-child(odd) { transform: rotate(-0.35deg); }
.ot-root[data-template="little-question"] .ot-hero {
  min-height: clamp(32rem, 62cqi, 39rem);
  grid-template-columns: minmax(13rem, 0.82fr) minmax(18rem, 1.18fr);
  gap: clamp(2rem, 6cqi, 4.5rem);
  padding: clamp(4rem, 8cqi, 6rem) clamp(2rem, 7cqi, 5rem);
}
.ot-root[data-template="little-question"] .ot-hero h1 {
  max-width: 9ch;
  font-size: clamp(3rem, 9cqi, 5.4rem);
  line-height: 0.98;
}
.ot-root[data-template="little-question"] .ot-hero-copy {
  max-width: 28rem;
}
.ot-root[data-template="little-question"] .ot-hero[data-has-image="false"] {
  grid-template-columns: 1fr;
}
.ot-root[data-template="little-question"] .ot-hero[data-has-image="false"] .ot-hero-copy {
  width: min(100%, 36rem);
  max-width: none;
  margin-inline: auto;
  text-align: center;
}
.ot-root[data-template="little-question"] .ot-hero[data-has-image="false"] h1 {
  margin-inline: auto;
}
.ot-root[data-template="little-question"] .ot-hero[data-has-image="false"] .ot-hero-copy > p,
.ot-root[data-template="little-question"] .ot-hero[data-has-image="false"] .ot-hero-copy > time {
  margin-inline: auto;
}
.ot-root[data-template="little-question"] .ot-lq-paper-art {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: none;
  pointer-events: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ot-root[data-template="little-question"] .ot-lq-paper-fold {
  stroke: color-mix(in srgb, var(--ie-ribbon) 18%, transparent);
  stroke-width: 0.35;
}
.ot-root[data-template="little-question"] .ot-lq-paper-stitch {
  stroke: color-mix(in srgb, var(--ie-ribbon) 36%, transparent);
  stroke-dasharray: 0.9 1.4;
  stroke-width: 0.35;
}
.ot-root[data-template="little-question"] .ot-lq-paper-heart {
  fill: color-mix(in srgb, var(--ie-ribbon) 7%, transparent);
  stroke: color-mix(in srgb, var(--ie-ribbon) 45%, transparent);
  stroke-width: 0.38;
}
.ot-root[data-template="little-question"] .ot-hero > .ot-motif {
  position: absolute;
  z-index: 2;
  top: 6%;
  right: 5%;
  width: clamp(4rem, 11cqi, 6rem);
  color: var(--ie-ribbon);
  transform: rotate(8deg);
}
.ot-root[data-template="little-question"] .ot-lq-stamp-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.ot-root[data-template="little-question"] .ot-lq-stamp-edge {
  fill: color-mix(in srgb, var(--ie-paper) 76%, white);
  stroke: color-mix(in srgb, var(--ie-ribbon) 50%, transparent);
  stroke-width: 1.15;
}
.ot-root[data-template="little-question"] .ot-lq-stamp-ring {
  fill: none;
  stroke: color-mix(in srgb, var(--ie-ribbon) 42%, transparent);
  stroke-dasharray: 2.4 2.8;
  stroke-width: 1.1;
}
.ot-root[data-template="little-question"] .ot-lq-stamp-heart {
  fill: color-mix(in srgb, var(--ie-ribbon) 11%, transparent);
  stroke: color-mix(in srgb, var(--ie-ribbon) 52%, transparent);
  stroke-width: 1.1;
}
.ot-root[data-template="little-question"] .ot-hero-photo,
.ot-root[data-template="little-question"] .ot-hero-placeholder {
  width: min(100%, 16.5rem);
  justify-self: center;
  padding: 0.55rem 0.55rem 2.35rem;
  border: 1px solid color-mix(in srgb, var(--ie-ink) 18%, transparent);
  background: color-mix(in srgb, var(--ie-paper) 88%, white);
  box-shadow:
    0.42rem 0.52rem 0 color-mix(in srgb, var(--ie-ribbon) 16%, transparent),
    0 0.8rem 1.8rem color-mix(in srgb, var(--ie-ink) 9%, transparent);
  transform: rotate(-2.2deg);
}
.ot-root[data-template="little-question"] .ot-hero-placeholder {
  min-height: 0;
  aspect-ratio: 4 / 5;
}
.ot-root[data-template="little-question"] .ot-message-body {
  max-width: 34rem;
  font-size: clamp(1.15rem, 3.2cqi, 1.7rem);
}
.ot-root[data-template="little-question"] .ot-event-grid article {
  max-width: 34rem;
  margin-inline: auto;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 26%, transparent);
  border-radius: 0.45rem;
  background: color-mix(in srgb, var(--ie-paper) 84%, var(--ie-background));
  text-align: center;
}
.ot-root[data-template="little-question"] .ot-gallery-grid figure {
  padding: 0.45rem 0.45rem 1.25rem;
  border: 1px solid color-mix(in srgb, var(--ie-ink) 15%, transparent);
  background: color-mix(in srgb, var(--ie-paper) 88%, white);
  box-shadow: 0.35rem 0.4rem 0 color-mix(in srgb, var(--ie-ribbon) 12%, transparent);
}
.ot-root[data-template="little-question"] .ot-gallery-grid figure:nth-child(2) { transform: rotate(1.2deg); }
.ot-root[data-template="little-question"] .ot-gallery-grid figure:nth-child(3) { transform: rotate(-1deg); }
.ot-root[data-template="little-question"] .ot-rsvp {
  min-height: clamp(30rem, 54cqi, 37rem);
  align-content: center;
  padding: clamp(3.5rem, 7cqi, 5rem) clamp(1.5rem, 8cqi, 5rem);
  background:
    radial-gradient(80% 70% at 88% 16%, color-mix(in srgb, white 40%, transparent), transparent 70%),
    color-mix(in srgb, var(--ie-ribbon) 9%, var(--ie-paper));
  text-align: center;
}
.ot-root[data-template="little-question"] .ot-rsvp > :not(.ot-lq-paper-art) {
  position: relative;
  z-index: 1;
}
.ot-root[data-template="little-question"] .ot-rsvp > h2 {
  max-width: 12ch;
  margin-inline: auto;
  font-size: clamp(2.85rem, 7.5cqi, 4.85rem);
  line-height: 0.98;
}
.ot-root[data-template="little-question"] .ot-rsvp > p {
  max-width: 29rem;
  font-size: clamp(1rem, 2.2cqi, 1.18rem);
}
.ot-root[data-template="little-question"] .ot-lq-paper-perforation {
  stroke: color-mix(in srgb, var(--ie-ribbon) 22%, transparent);
  stroke-dasharray: 0.65 1.2;
  stroke-width: 0.28;
}
.ot-root[data-template="little-question"] .ot-lq-reply-mark {
  display: block;
  width: 5.4rem;
  height: auto;
  margin: 0 auto 1.3rem;
  overflow: visible;
}
.ot-root[data-template="little-question"] .ot-lq-reply-line {
  fill: none;
  stroke: color-mix(in srgb, var(--ie-ribbon) 42%, transparent);
  stroke-dasharray: 3 3;
  stroke-width: 1;
}
.ot-root[data-template="little-question"] .ot-lq-reply-heart {
  fill: color-mix(in srgb, var(--ie-ribbon) 10%, transparent);
  stroke: var(--ie-ribbon);
  stroke-width: 1.2;
}
.ot-root[data-template="little-question"] .ot-rsvp-slot {
  position: relative;
  width: min(100%, 34rem);
  margin: 2.15rem auto 0;
  padding: clamp(1rem, 3cqi, 1.4rem);
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 38%, transparent);
  border-radius: 0.35rem;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--ie-ribbon) 4%, transparent), transparent 24%),
    color-mix(in srgb, var(--ie-paper) 94%, white);
  box-shadow:
    0.42rem 0.5rem 0 color-mix(in srgb, var(--ie-ribbon) 13%, transparent),
    0 0.8rem 1.8rem color-mix(in srgb, var(--ie-ink) 7%, transparent);
}
.ot-root[data-template="little-question"] .ot-rsvp-slot::before {
  position: absolute;
  inset: 0.45rem;
  border: 1px dashed color-mix(in srgb, var(--ie-ribbon) 20%, transparent);
  content: "";
  pointer-events: none;
}
.ot-root[data-template="little-question"] .ot-rsvp-slot > * {
  position: relative;
  z-index: 1;
}
.ot-root[data-template="little-question"] .ot-rsvp-slot > .rsvp-card {
  padding: 0.45rem;
}
.ot-root[data-template="little-question"] .ot-rsvp-slot .rq-choices {
  width: min(100%, 29rem);
  margin-inline: auto;
}
.ot-root[data-template="little-question"] .ot-footer .ot-motif {
  color: var(--ie-ribbon);
  transform: rotate(-7deg);
}

/* Sunday Joy — sunlit cut-paper party book. */
.ot-root[data-template="sunday-joy"] {
  /* Quick pace: cards snap into place over 14% of their entrance, the fastest of the three. */
  --ot-reveal-range: 14%;
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
.ot-root[data-template="sunday-joy"] .ot-hero-copy {
  grid-column: 1;
  grid-row: 1 / span 2;
  align-self: center;
}
.ot-root[data-template="sunday-joy"] .ot-hero > .ot-motif {
  grid-column: 2;
  grid-row: 1;
  width: min(100%, 16rem);
  justify-self: center;
}
/* The birthday photograph is a snapshot taped into the party book: a thick cut-paper mount under the
   pinwheel, tipped off-square like the section cards around it. Only the empty slot is held to
   portrait proportion; a real photograph keeps its own aspect ratio inside the same mount.

   The mount carries more ink than the section cards use. On a card the coral offset shadow draws the
   edge; on an 11rem mount the border is the whole cut-paper edge, and the cards' 14% does not read
   against #fffaf0 at that size. */
.ot-root[data-template="sunday-joy"] .ot-hero-photo,
.ot-root[data-template="sunday-joy"] .ot-hero-placeholder {
  grid-column: 2;
  grid-row: 2;
  width: min(100%, 11rem);
  padding: 0.5rem;
  border: 2px solid color-mix(in srgb, var(--ie-ink) 24%, transparent);
  border-radius: 0.7rem;
  background: var(--ie-paper);
  box-shadow: 0.35rem 0.4rem 0 color-mix(in srgb, var(--ie-ribbon) 18%, transparent);
  transform: rotate(-2deg);
  align-self: start;
  justify-self: center;
}
.ot-root[data-template="sunday-joy"] .ot-hero-placeholder {
  min-height: 0;
  aspect-ratio: 4 / 5;
}
/* The feature plate spans both columns, so it takes a landscape crop rather than running to half a
   screen of empty mount at the shared album proportion. */
.ot-root[data-template="sunday-joy"] .ot-gallery-grid figure:nth-child(3n + 1) .ot-media-placeholder {
  aspect-ratio: 16 / 9;
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
  .ot-root[data-template="garden-promise"] .ot-hero > .ot-motif { width: 5.5rem; }
  .ot-root[data-template="garden-promise"] .ot-hero-copy { grid-row: 2; }
  .ot-root[data-template="garden-promise"] .ot-hero-photo,
  .ot-root[data-template="garden-promise"] .ot-hero-placeholder,
  .ot-root[data-template="sunday-joy"] .ot-hero-photo,
  .ot-root[data-template="sunday-joy"] .ot-hero-placeholder {
    grid-column: 1;
    grid-row: 3;
    margin-top: 0.5rem;
  }
  .ot-root[data-template="garden-promise"] .ot-event-grid article + article {
    border-top: 0;
    border-left: 0;
  }
  .ot-root[data-template="garden-promise"] .ot-participant-grid {
    columns: 1;
    column-rule: 0;
  }
  /* The hero's own padding is clamp(5rem, 12cqi, 8rem) at higher specificity than the .ot-section
     rule above, so a 390px phone kept 80px on every side and set a fifteen-character title in a
     230px column. A debutante's full name is longer than that. */
  .ot-root[data-template="golden-hour"] .ot-hero { padding: 4.5rem 1.5rem; }
  /* Three stacked groups of eighteen names ran 1,753px, a fifth of the phone page. The cards keep
     their brass borders and take a two-column name list instead. Vertical rhythm moves from the
     li + li margin to per-item padding so both columns start on the same baseline, and the cards
     gain the inline padding the wider single-column list never needed. */
  .ot-root[data-template="golden-hour"] .ot-participant-grid article { padding-inline: 1.25rem; }
  .ot-root[data-template="golden-hour"] .ot-participant-grid ul {
    columns: 2;
    column-gap: 1rem;
  }
  .ot-root[data-template="golden-hour"] .ot-participant-grid li {
    padding-block: 0.15rem;
    break-inside: avoid;
  }
  .ot-root[data-template="golden-hour"] .ot-participant-grid li + li { margin-top: 0; }
  .ot-root[data-template="golden-hour"] .ot-message { display: block; text-align: center; }
  .ot-root[data-template="golden-hour"] .ot-message-body { margin: 1.5rem auto 0; }
  .ot-root[data-template="golden-hour"] .ot-signature {
    grid-column: auto;
    justify-items: center;
  }
  .ot-root[data-template="golden-hour"] .ot-schedule ol { grid-template-columns: 1fr; }
  .ot-root[data-template="little-question"] .ot-section,
  .ot-root[data-template="little-question"] .ot-section:nth-child(even),
  .ot-root[data-template="little-question"] .ot-section:nth-child(odd) {
    transform: none;
  }
  .ot-root[data-template="little-question"] .ot-hero {
    min-height: 0;
    grid-template-columns: 1fr;
    gap: 2.4rem;
    padding: 4.5rem 1.35rem 3.5rem;
    text-align: center;
  }
  .ot-root[data-template="little-question"] .ot-hero h1 {
    max-width: 10ch;
    margin-inline: auto;
    font-size: clamp(2.8rem, 15cqi, 4.2rem);
  }
  .ot-root[data-template="little-question"] .ot-hero-copy { max-width: none; }
  .ot-root[data-template="little-question"] .ot-hero-copy > p,
  .ot-root[data-template="little-question"] .ot-hero-copy > time { margin-inline: auto; }
  .ot-root[data-template="little-question"] .ot-hero-photo,
  .ot-root[data-template="little-question"] .ot-hero-placeholder { margin-inline: auto; }
  .ot-root[data-template="little-question"] .ot-hero > .ot-motif {
    top: 1.1rem;
    right: 1rem;
    width: 4rem;
  }
  .ot-root[data-template="little-question"] .ot-rsvp {
    min-height: 0;
    padding: 3.75rem 1.25rem;
  }
  .ot-root[data-template="little-question"] .ot-rsvp > h2 {
    font-size: clamp(2.65rem, 14cqi, 4rem);
  }
  .ot-root[data-template="little-question"] .ot-rsvp-slot {
    padding: 0.85rem !important;
  }
  .ot-root[data-template="sunday-joy"] .ot-section,
  .ot-root[data-template="sunday-joy"] .ot-section:nth-child(even),
  .ot-root[data-template="sunday-joy"] .ot-section:nth-child(odd) {
    transform: none;
  }
  .ot-root[data-template="sunday-joy"] .ot-gallery-grid figure:nth-child(3n + 1) {
    grid-column: auto;
  }
  /* One column, so no plate spans anything: the feature crop returns to the album shape. */
  .ot-root[data-template="sunday-joy"] .ot-gallery-grid figure:nth-child(3n + 1) .ot-media-placeholder {
    aspect-ratio: 4 / 3;
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
