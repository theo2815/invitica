"use client";

import type { InvitationSection } from "@invitica/invitation-schema";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { InteractiveMap, interactiveMapStyles } from "./InteractiveMap.js";
import type {
  InvitationAudience,
  InvitationImageResolver,
  InvitationRendererProps,
  ResolvedRendererImage,
} from "./InvitationRenderer.js";
import { buildIcsCalendar } from "./ics.js";
import {
  largestImageRendition,
  PhotoPreviewDialog,
  type PhotoPreviewItem,
  PhotoPreviewTrigger,
  photoPreviewStyles,
} from "./PhotoPreview.js";
import { PoweredByInvitica, poweredByInviticaStyles } from "./PoweredByInvitica.js";
import { RibbonEnvelopeOpening, ribbonEnvelopeStyles } from "./RibbonEnvelopeOpening.js";
import { useCountdown } from "./useCountdown.js";

type RevealState = "idle" | "armed" | "revealed";

/**
 * Reveals a block once when it first scrolls into view (transform/opacity, handled in CSS).
 * SSR and the first client render stay in "idle" (no data attribute → fully visible), so the
 * content is never hidden without JavaScript. When motion is disabled it resolves straight to
 * "revealed" with no hidden intermediate state.
 */
function useRevealOnce<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<RevealState>("idle");

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof IntersectionObserver === "undefined") {
      setState("revealed");
      return;
    }

    setState("armed");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setState("revealed");
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, revealState: state } as const;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "event"
  );
}

const CALENDAR_EVENT_DURATION_MS = 60 * 60 * 1000;

const HERO_IMAGE_SIZES = "(max-width: 40rem) 78vw, 22rem";
const CARD_IMAGE_SIZES = "(max-width: 40rem) 88vw, 16rem";

type GallerySection = Extract<InvitationSection, { type: "gallery" }>;

/** Closing mark: a bound book seen spine-on, with the stitching that holds its pages. */
function KeepsakeMark() {
  return (
    <svg aria-hidden="true" className="lb-mark" focusable="false" viewBox="0 0 96 64">
      <path d="M14 10h68v44H14z" />
      <path d="M24 10v44" />
      <path className="lb-mark-stitch" d="M19 16v32" />
      <path d="M48 21c6-4 14-4 20 0" />
      <path d="M48 32c6-4 14-4 20 0" />
    </svg>
  );
}

/**
 * The cover plate: a pearl label held by photo corners, titling the book the way a hand-bound baby
 * memory book is titled. It is mounted on the cloth cover so it swings away with it, and CSS hides
 * its backface once the cover turns past its own plane. Everything it says is repeated as real text
 * in the hero below, because the envelope is hidden from assistive technology.
 */
function KeepsakeCoverPlate({ dateLabel, title }: { dateLabel?: string; title: string }) {
  return (
    <span className="lb-cover-plate">
      <span className="lb-cover-eyebrow">A christening keepsake</span>
      <strong className="lb-cover-name">{title}</strong>
      {dateLabel ? <span className="lb-cover-date">{dateLabel}</span> : null}
    </span>
  );
}

function LittleBlessingsPetals() {
  return (
    <div aria-hidden="true" className="lb-petals">
      {Array.from({ length: 9 }, (_, index) => (
        <span className="lb-petal" key={index} />
      ))}
    </div>
  );
}

type AttireSection = Extract<InvitationSection, { type: "attire" }>;

/** Colour swatches, shared by the section's own guidance and each audience's dress code. */
function AttireColors({ colors }: { colors: AttireSection["props"]["colors"] }) {
  if (!colors) {
    return null;
  }

  return (
    <ul className="lb-color-list">
      {colors.map((color) => (
        <li key={color.value}>
          <span aria-hidden="true" style={{ backgroundColor: color.value }} />
          {color.label}
        </li>
      ))}
    </ul>
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
      height={largest.height}
      loading={loading}
      sizes={sizes}
      src={largest.url}
      srcSet={ordered.map((rendition) => `${rendition.url} ${rendition.width}w`).join(", ")}
      width={largest.width}
    />
  );
}

function photoOrientation(image: ResolvedRendererImage): "landscape" | "portrait" | "square" {
  const largest = largestImageRendition(image);
  const ratio = largest ? largest.width / largest.height : image.width / image.height;
  if (ratio > 1.12) return "landscape";
  if (ratio < 0.88) return "portrait";
  return "square";
}

const COUNTDOWN_UNITS = [
  { key: "days", label: "days" },
  { key: "hours", label: "hours" },
  { key: "minutes", label: "minutes" },
  { key: "seconds", label: "seconds" },
] as const;

function padUnit(value: number): string {
  return value.toString().padStart(2, "0");
}

function LittleBlessingsCountdown({
  section,
}: {
  section: Extract<InvitationSection, { type: "countdown" }>;
}) {
  const remaining = useCountdown(section.props.target);

  return (
    <section
      className="lb-section lb-countdown"
      data-animation={section.animationPreset}
      data-section-type={section.type}
    >
      {section.props.heading ? <h2>{section.props.heading}</h2> : null}
      {remaining ? (
        remaining.isPast ? (
          <p className="lb-countdown-remaining">The celebration day is here</p>
        ) : (
          <ol aria-label="Time remaining until the celebration" className="lb-countdown-tiles">
            {COUNTDOWN_UNITS.map((unit) => (
              <li key={unit.key}>
                <span>{unit.key === "days" ? remaining.days : padUnit(remaining[unit.key])}</span>
                <small>{unit.label}</small>
              </li>
            ))}
          </ol>
        )
      ) : null}
      <time dateTime={section.props.target}>{section.props.dateLabel}</time>
    </section>
  );
}

interface GalleryEntry {
  readonly image: GallerySection["props"]["images"][number];
  readonly resolved: ResolvedRendererImage | null;
}

/**
 * Names a photograph's controls. Both caption fields are optional, so a creator may tip in a
 * picture with no writing under it; the control still needs a name, and position within the album
 * is the only truthful thing left to say. The image itself always carries alt="" because the
 * figcaption names the figure — repeating it would make a screen reader read the line twice.
 */
function galleryPhotoSuffix(
  image: GallerySection["props"]["images"][number],
  index: number,
  total: number,
): string {
  const text = image.title ?? image.caption;
  return text ? `: ${text}` : ` ${index + 1} of ${total}`;
}

function LittleBlessingsGallery({
  reducedMotion,
  resolveImage,
  section,
}: {
  reducedMotion: boolean;
  resolveImage: InvitationImageResolver | undefined;
  section: GallerySection;
}) {
  const { ref: revealRef, revealState } = useRevealOnce<HTMLElement>(!reducedMotion);
  const entries: readonly GalleryEntry[] = section.props.images.map((image) => ({
    image,
    resolved: resolveImage?.(image.assetId) ?? null,
  }));
  const previewItems: readonly PhotoPreviewItem[] = entries.flatMap((entry, index) =>
    entry.resolved
      ? [
          {
            ...(entry.image.caption ? { description: entry.image.caption } : {}),
            id: entry.image.assetId,
            image: entry.resolved,
            label:
              entry.image.title ?? entry.image.caption ?? `Photo ${index + 1} of ${entries.length}`,
            ...(entry.image.title ? { title: entry.image.title } : {}),
          },
        ]
      : [],
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <section
      className="lb-section lb-gallery"
      data-animation={section.animationPreset}
      data-reveal={revealState === "idle" ? undefined : revealState}
      data-section-type={section.type}
      ref={revealRef}
    >
      {section.props.heading ? <h2>{section.props.heading}</h2> : null}
      {section.props.description ? <p>{section.props.description}</p> : null}
      <div className="lb-gallery-grid">
        {entries.map((entry, index) => {
          const element = entry.resolved
            ? resolvedImageElement(entry.resolved, "", "lb-media-image", "lazy", CARD_IMAGE_SIZES)
            : null;
          const previewIndex = previewItems.findIndex((item) => item.id === entry.image.assetId);
          const previewHref = entry.resolved ? largestImageRendition(entry.resolved)?.url : null;

          return (
            <figure
              data-asset-id={entry.image.assetId}
              data-photo-orientation={entry.resolved ? photoOrientation(entry.resolved) : undefined}
              key={entry.image.assetId}
            >
              {element && previewHref && previewIndex >= 0 ? (
                <PhotoPreviewTrigger
                  className="lb-gallery-trigger"
                  href={previewHref}
                  label={`View photo${galleryPhotoSuffix(entry.image, index, entries.length)}`}
                  onOpen={() => setActiveIndex(previewIndex)}
                >
                  {element}
                </PhotoPreviewTrigger>
              ) : (
                <div aria-hidden="true" className="lb-media-placeholder">
                  Image pending creator upload
                </div>
              )}
              {/* A plate with no writing under it gets no figcaption at all, not an empty one. */}
              {entry.image.title || entry.image.caption ? (
                <figcaption>
                  {entry.image.title ? <strong>{entry.image.title}</strong> : null}
                  {entry.image.caption ? <span>{entry.image.caption}</span> : null}
                </figcaption>
              ) : null}
            </figure>
          );
        })}
      </div>
      <PhotoPreviewDialog
        activeIndex={activeIndex}
        className="lb-photo-preview"
        items={previewItems}
        onActiveIndexChange={setActiveIndex}
        onClose={() => setActiveIndex(null)}
        reducedMotion={reducedMotion}
      />
    </section>
  );
}

type EventDetailsSection = Extract<InvitationSection, { type: "event-details" }>;
type BlessingEvent = EventDetailsSection["props"]["events"][number];

function LittleBlessingsEventDetails({
  mapTileKey,
  reducedMotion,
  section,
}: {
  mapTileKey: string | undefined;
  reducedMotion: boolean;
  section: EventDetailsSection;
}) {
  // The calendar download is a client-only enhancement: only reveal the control after hydration so
  // no-JavaScript guests never see an inert button.
  const [canDownload, setCanDownload] = useState(false);
  useEffect(() => setCanDownload(true), []);

  function downloadCalendar(event: BlessingEvent) {
    const start = new Date(event.startAt);
    const description = [event.arrivalNote, event.address].filter(Boolean).join("\n");
    const ics = buildIcsCalendar(
      [
        {
          uid: `${event.startAt}-${slugify(event.venueName)}@invitica`,
          start,
          end: new Date(start.getTime() + CALENDAR_EVENT_DURATION_MS),
          summary: `${event.label} — ${event.venueName}`,
          location: `${event.venueName}, ${event.address}`,
          ...(description ? { description } : {}),
        },
      ],
      new Date(),
    );

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(event.label)}.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section
      className="lb-section lb-event-details"
      data-animation={section.animationPreset}
      data-section-type={section.type}
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
            <div className="lb-event-actions">
              {canDownload ? (
                <button
                  className="lb-action lb-action-calendar"
                  onClick={() => downloadCalendar(event)}
                  type="button"
                >
                  Add to calendar
                </button>
              ) : null}
              {event.mapUrl ? (
                <a
                  className="lb-action lb-action-directions"
                  href={event.mapUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Get directions
                </a>
              ) : null}
            </div>
            {event.latitude !== undefined && event.longitude !== undefined && mapTileKey ? (
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

type HeroSection = Extract<InvitationSection, { type: "hero" }>;

function LittleBlessingsHero({
  reducedMotion,
  resolveImage,
  section,
}: {
  reducedMotion: boolean;
  resolveImage: InvitationImageResolver | undefined;
  section: HeroSection;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const heroAssetId = section.props.imageAssetId;
  const heroImage = heroAssetId ? (resolveImage?.(heroAssetId) ?? null) : null;
  const heroImageElement = heroImage
    ? resolvedImageElement(heroImage, "", "lb-media-image lb-hero-image", "eager", HERO_IMAGE_SIZES)
    : null;
  const largest = heroImage ? largestImageRendition(heroImage) : null;
  const previewItems: readonly PhotoPreviewItem[] =
    heroAssetId && heroImage
      ? [
          {
            description: "Celebrant portrait",
            id: heroAssetId,
            image: heroImage,
            label: `Celebrant photo of ${section.props.title}`,
            title: section.props.title,
          },
        ]
      : [];
  const [heroLeadName, ...heroRestName] = section.props.title.trim().split(/\s+/);
  const heroRest = heroRestName.join(" ");

  return (
    <section
      className="lb-section lb-hero"
      data-animation={section.animationPreset}
      data-section-type={section.type}
    >
      {heroAssetId ? (
        <div
          className="lb-hero-frame"
          data-asset-id={heroAssetId}
          data-photo-orientation={heroImage ? photoOrientation(heroImage) : undefined}
        >
          {heroImageElement && largest ? (
            <PhotoPreviewTrigger
              className="lb-hero-photo-trigger"
              href={largest.url}
              label={`View celebrant photo of ${section.props.title}`}
              onOpen={() => setActiveIndex(0)}
            >
              {heroImageElement}
            </PhotoPreviewTrigger>
          ) : (
            <div aria-hidden="true" className="lb-media-placeholder">
              Baby portrait pending creator upload
            </div>
          )}
        </div>
      ) : null}
      <div className="lb-hero-head">
        {section.props.eyebrow ? <p className="lb-eyebrow">{section.props.eyebrow}</p> : null}
        <h1>
          <em className="lb-hero-name">{heroLeadName}</em>
          {heroRest ? <span className="lb-hero-surname">{heroRest}</span> : null}
        </h1>
        {section.props.subtitle ? <p className="lb-hero-copy">{section.props.subtitle}</p> : null}
        {section.props.dateLabel ? <time>{section.props.dateLabel}</time> : null}
      </div>
      <PhotoPreviewDialog
        activeIndex={activeIndex}
        className="lb-photo-preview"
        items={previewItems}
        onActiveIndexChange={setActiveIndex}
        onClose={() => setActiveIndex(null)}
        reducedMotion={reducedMotion}
      />
    </section>
  );
}

type GiftsSection = Extract<InvitationSection, { type: "gifts" }>;

function LittleBlessingsGifts({
  reducedMotion,
  resolveImage,
  section,
}: {
  reducedMotion: boolean;
  resolveImage: InvitationImageResolver | undefined;
  section: GiftsSection;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const entries = section.props.items.map((item) => ({
    item,
    resolved: item.imageAssetId ? (resolveImage?.(item.imageAssetId) ?? null) : null,
  }));
  const previewItems: readonly PhotoPreviewItem[] = entries.flatMap(({ item, resolved }) =>
    item.imageAssetId && resolved
      ? [
          {
            ...(item.note ? { description: item.note } : {}),
            id: item.imageAssetId,
            image: resolved,
            label: `Gift idea: ${item.name}`,
            title: item.name,
          },
        ]
      : [],
  );

  return (
    <section
      className="lb-section lb-gifts"
      data-animation={section.animationPreset}
      data-section-type={section.type}
    >
      {section.props.heading ? <h2>{section.props.heading}</h2> : null}
      {section.props.message ? <p>{section.props.message}</p> : null}
      <div className="lb-gift-grid">
        {entries.map(({ item, resolved }) => {
          const element = resolved
            ? resolvedImageElement(resolved, "", "lb-media-image", "lazy", CARD_IMAGE_SIZES)
            : null;
          const previewIndex = item.imageAssetId
            ? previewItems.findIndex((previewItem) => previewItem.id === item.imageAssetId)
            : -1;
          const previewHref = resolved ? largestImageRendition(resolved)?.url : null;

          return (
            <article
              data-asset-id={item.imageAssetId}
              data-photo-orientation={resolved ? photoOrientation(resolved) : undefined}
              key={item.name}
            >
              {item.imageAssetId ? (
                element && previewHref && previewIndex >= 0 ? (
                  <PhotoPreviewTrigger
                    className="lb-gift-photo-trigger"
                    href={previewHref}
                    label={`View gift idea photo: ${item.name}`}
                    onOpen={() => setActiveIndex(previewIndex)}
                  >
                    {element}
                  </PhotoPreviewTrigger>
                ) : (
                  <div aria-hidden="true" className="lb-media-placeholder">
                    Gift image pending creator upload
                  </div>
                )
              ) : null}
              <h3>{item.name}</h3>
              {item.note ? <p>{item.note}</p> : null}
            </article>
          );
        })}
      </div>
      <PhotoPreviewDialog
        activeIndex={activeIndex}
        className="lb-photo-preview"
        items={previewItems}
        onActiveIndexChange={setActiveIndex}
        onClose={() => setActiveIndex(null)}
        reducedMotion={reducedMotion}
      />
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
  reducedMotion: boolean,
  mapTileKey: string | undefined,
): ReactElement {
  switch (section.type) {
    case "hero":
      return (
        <LittleBlessingsHero
          key={section.id}
          reducedMotion={reducedMotion}
          resolveImage={resolveImage}
          section={section}
        />
      );

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
          {section.props.signature ? (
            <footer className="lb-signature">
              {section.props.signature.lead ? <span>{section.props.signature.lead}</span> : null}
              <p>
                {section.props.signature.names.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </p>
            </footer>
          ) : null}
        </section>
      );

    case "countdown":
      return <LittleBlessingsCountdown key={section.id} section={section} />;

    case "event-details":
      return (
        <LittleBlessingsEventDetails
          key={section.id}
          mapTileKey={mapTileKey}
          reducedMotion={reducedMotion}
          section={section}
        />
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
                <p className="lb-schedule-time">{item.timeLabel}</p>
                <h3>{item.title}</h3>
                {item.description ? <p className="lb-schedule-note">{item.description}</p> : null}
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
          <AttireColors colors={section.props.colors} />
          {/*
           * Every guest sees every dress code. There is no guest role in the data model to target
           * on, and a godparent wants to know what the guests are wearing as much as the reverse.
           */}
          {section.props.groups ? (
            <div className="lb-attire-groups">
              {section.props.groups.map((group) => (
                <div key={group.label}>
                  <h3>{group.label}</h3>
                  <p>{group.description}</p>
                  <AttireColors colors={group.colors} />
                </div>
              ))}
            </div>
          ) : null}
        </section>
      );

    case "gallery":
      return (
        <LittleBlessingsGallery
          key={section.id}
          reducedMotion={reducedMotion}
          resolveImage={resolveImage}
          section={section}
        />
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
        <LittleBlessingsGifts
          key={section.id}
          reducedMotion={reducedMotion}
          resolveImage={resolveImage}
          section={section}
        />
      );

    case "venue":
      return unsupportedBlessingSection(section);

    default:
      return assertNever(section);
  }
}

/**
 * Replies are wanted only from personally invited guests, so the reply page is withheld from anyone
 * opening the general link. Gating happens here rather than at the edge because both link kinds
 * share one cached response. Preview always shows it, or the creator could not edit it.
 */
function isVisibleToAudience(
  section: InvitationSection,
  mode: InvitationRendererProps["mode"],
  audience: InvitationAudience,
): boolean {
  return !(section.type === "rsvp" && mode === "published" && audience === "general");
}

export function LittleBlessingsRenderer({
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
}: InvitationRendererProps) {
  const recipient = recipientName ?? document.opening.fallbackRecipientText;
  const hero = document.sections.find((section) => section.type === "hero" && section.visible) as
    | Extract<InvitationSection, { type: "hero" }>
    | undefined;
  const style = {
    "--lb-background": document.theme.colors.background,
    "--lb-paper": document.theme.colors.surface,
    "--lb-ink": document.theme.colors.text,
    "--lb-rose": document.theme.colors.accent,
    "--lb-rose-contrast": document.theme.colors.accentContrast,
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
      <style>{`${ribbonEnvelopeStyles}\n${interactiveMapStyles}\n${photoPreviewStyles}\n${poweredByInviticaStyles}\n${littleBlessingsStyles}`}</style>
      <RibbonEnvelopeOpening
        coverMark={
          hero ? (
            <KeepsakeCoverPlate
              {...(hero.props.dateLabel ? { dateLabel: hero.props.dateLabel } : {})}
              title={hero.props.title}
            />
          ) : null
        }
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
        sceneDecoration={<LittleBlessingsPetals />}
        variant="little-blessings"
      >
        <main className="lb-content" data-envelope-focus-target tabIndex={-1}>
          {document.sections
            .filter((section) => section.visible && isVisibleToAudience(section, mode, audience))
            .map((section) =>
              renderBlessingSection(
                section,
                document.locale,
                mode,
                rsvpSlot,
                document.eventTimezone,
                resolveImage,
                reducedMotion,
                mapTileKey,
              ),
            )}
        </main>
        <footer className="lb-footer">
          <KeepsakeMark />
          <p>With grateful hearts, thank you for celebrating with us</p>
          <PoweredByInvitica />
        </footer>
      </RibbonEnvelopeOpening>
    </article>
  );
}

const littleBlessingsStyles = `
/*
 * Little Blessings - "Keepsake Storybook".
 *
 * A hand-bound baby memory book rather than a poster: pearl leaves bound into a baby-pink cloth
 * cover, a numbered chapter mark opening each page, stitched (dashed) rules where other
 * families use ornament, and left-aligned editorial setting throughout. Composition carries
 * the theme, so the page reads as a sequence of pages instead of eleven identical blocks.
 */

.lb-root {
  --lb-trim: #c6a9b6;
  --lb-pearl: #fffbfc;
  --lb-blush: #f6dce0;
  /* Stitching and hairlines carry every division; there are no ornamental dividers. */
  --lb-stitch: color-mix(in srgb, var(--lb-trim) 62%, transparent);
  --lb-hairline: color-mix(in srgb, var(--lb-trim) 44%, transparent);
  /* Photo corners holding the cover plate, the way a keepsake photo is mounted. */
  --lb-corner: color-mix(in srgb, var(--lb-trim) 78%, transparent);
  /* 78% ink clears WCAG AA on both grounds: 5.19:1 on the baby-pink cover, 5.70:1 on a pearl leaf. */
  --lb-muted: color-mix(in srgb, var(--lb-ink) 78%, transparent);
  --lb-label: color-mix(in srgb, var(--lb-trim) 34%, var(--lb-ink));
  /* One horizontal gutter for the whole page, applied once on .lb-content. */
  --lb-gutter: clamp(1.15rem, 5cqi, 2.6rem);
  /* Cloth left visible around the leaves so the cover still frames the pages at every width. */
  --lb-leaf-inset: clamp(0.5rem, 2.5cqi, 1.25rem);
  --lb-rail: clamp(3.4rem, 9cqi, 4.75rem);
  /* Three deliberate vertical weights so the page has rhythm instead of one uniform interval. */
  --lb-space-feature: clamp(3.25rem, 9cqi, 5rem);
  --lb-space-standard: clamp(2.35rem, 6.5cqi, 3.5rem);
  --lb-space-compact: clamp(1.75rem, 4.5cqi, 2.5rem);
  --lb-paper-ease: cubic-bezier(0.22, 1, 0.36, 1);
  /*
   * Pressed keepsakes, drawn as alpha masks so they take the template's own accent instead of a
   * baked-in colour. Only ever applied inside the @supports guard below, so a browser without mask
   * support shows nothing rather than a coloured rectangle.
   */
  --lb-bloom: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60'%3E%3Cg fill='%23000'%3E%3Cellipse cx='30' cy='15' rx='4.4' ry='13'/%3E%3Cellipse cx='30' cy='15' rx='3.9' ry='12.4' transform='rotate(51 30 30)'/%3E%3Cellipse cx='30' cy='15' rx='4.2' ry='12.8' transform='rotate(103 30 30)'/%3E%3Cellipse cx='30' cy='15' rx='3.8' ry='12.2' transform='rotate(154 30 30)'/%3E%3Cellipse cx='30' cy='15' rx='4.3' ry='13' transform='rotate(206 30 30)'/%3E%3Cellipse cx='30' cy='15' rx='3.9' ry='12.5' transform='rotate(257 30 30)'/%3E%3Cellipse cx='30' cy='15' rx='4.1' ry='12.6' transform='rotate(309 30 30)'/%3E%3Ccircle cx='30' cy='30' r='3.2'/%3E%3C/g%3E%3C/svg%3E");
  --lb-sprig: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60'%3E%3Cg fill='%23000'%3E%3Crect x='29' y='7' width='2' height='47' rx='1'/%3E%3Cellipse cx='20' cy='19' rx='9' ry='4.6' transform='rotate(-26 20 19)'/%3E%3Cellipse cx='40' cy='27' rx='8.5' ry='4.4' transform='rotate(26 40 27)'/%3E%3Cellipse cx='20' cy='35' rx='8' ry='4.2' transform='rotate(-26 20 35)'/%3E%3Cellipse cx='40' cy='43' rx='7.5' ry='4' transform='rotate(26 40 43)'/%3E%3C/g%3E%3C/svg%3E");
  container-type: inline-size;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: clip;
  isolation: isolate;
  /*
   * Laid paper: fine laid lines every 5px with stronger chain lines every 2.4rem, the way real
   * mould-made stationery is ribbed. Two cheap repeating gradients, no image request.
   */
  background:
    repeating-linear-gradient(
      90deg,
      color-mix(in srgb, var(--lb-trim) 8%, transparent) 0 1px,
      transparent 1px 5px
    ),
    repeating-linear-gradient(
      90deg,
      color-mix(in srgb, var(--lb-trim) 12%, transparent) 0 1px,
      transparent 1px 2.4rem
    ),
    linear-gradient(180deg, rgb(255 251 252 / 34%), transparent 38%),
    var(--lb-background);
  color: var(--lb-ink);
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
  font-synthesis: none;
  line-height: 1.6;
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

/*
 * The opener is a ribbon-tied keepsake book. The shared envelope parts are re-cast: the flap
 * becomes the cloth cover hinged at the left spine, the front becomes the page block behind it,
 * the back becomes the rear cover, and the letter becomes page one.
 */
/* A warm pool of light gathers behind the book so the cover lifts off the laid paper. */
.lb-root .ie-opening {
  background:
    radial-gradient(ellipse 62% 46% at 50% 44%, rgb(255 251 252 / 66%), transparent 72%),
    linear-gradient(180deg, rgb(255 251 252 / 30%), transparent 52%);
}
.lb-root .ie-opening::before {
  border: 1px dashed var(--lb-stitch);
}
/* Two pressed keepsakes tucked into opposite corners of the closed scene. */
@supports (mask-image: url("")) or (-webkit-mask-image: url("")) {
  .lb-root .ie-opening::after {
    position: absolute;
    top: clamp(2rem, 9cqi, 4.5rem);
    right: clamp(1.6rem, 7cqi, 4rem);
    width: clamp(3.4rem, 13cqi, 5.5rem);
    aspect-ratio: 1;
    background-color: color-mix(in srgb, var(--lb-rose) 14%, transparent);
    content: "";
    pointer-events: none;
    rotate: 16deg;
    -webkit-mask-image: var(--lb-bloom);
    mask-image: var(--lb-bloom);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: contain;
    mask-size: contain;
  }
  .lb-root .ie-scene::after {
    position: absolute;
    bottom: -6%;
    left: -4%;
    width: clamp(2.8rem, 11cqi, 4.5rem);
    aspect-ratio: 1;
    background-color: color-mix(in srgb, var(--lb-trim) 28%, transparent);
    content: "";
    pointer-events: none;
    rotate: -22deg;
    -webkit-mask-image: var(--lb-sprig);
    mask-image: var(--lb-sprig);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: contain;
    mask-size: contain;
  }
  /* Both dissolve with the book so nothing lingers behind page one. */
  .lb-root .ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-opening::after,
  .lb-root .ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-scene::after {
    opacity: 0;
    transition: opacity 620ms ease;
  }
}
.lb-root .ie-opening-kicker {
  color: var(--lb-label);
  font-size: 0.66rem;
  letter-spacing: 0.2em;
}
.lb-root .ie-scene {
  min-height: clamp(18rem, 62cqi, 23rem);
  perspective: 62rem;
}
.lb-root .ie-envelope {
  width: min(58%, 14rem);
  aspect-ratio: 0.74;
}
.lb-root .ie-scene:hover:not([aria-disabled="true"]) .ie-envelope {
  transform: translateY(-0.25rem);
}
/* Rear cover. */
.lb-root .ie-envelope-back {
  border-color: color-mix(in srgb, var(--lb-rose) 30%, transparent);
  border-radius: 0.1rem 0.45rem 0.45rem 0.1rem;
  background: linear-gradient(
    100deg,
    color-mix(in srgb, var(--lb-rose) 30%, var(--lb-blush)),
    var(--lb-blush)
  );
  box-shadow: 0 1.4rem 1.6rem color-mix(in srgb, var(--lb-ink) 18%, transparent);
}
/* The page block: pearl paper with a hinted fore-edge on the right. */
.lb-root .ie-envelope-front {
  clip-path: none;
  border-color: var(--lb-hairline);
  border-radius: 0.08rem 0.35rem 0.35rem 0.08rem;
  background:
    linear-gradient(
      90deg,
      transparent calc(100% - 0.42rem),
      color-mix(in srgb, var(--lb-trim) 26%, transparent) calc(100% - 0.42rem)
    ),
    var(--lb-pearl);
}
/*
 * The cloth cover. It swings open on the left spine rather than folding back like an envelope
 * flap, and stays visible through the swing so the book reads as a book.
 */
.lb-root .ie-envelope-flap {
  clip-path: none;
  border-color: color-mix(in srgb, var(--lb-rose) 44%, transparent);
  border-radius: 0.1rem 0.45rem 0.45rem 0.1rem;
  background:
    /* Three stitched bands down the spine, as a hand-bound cover is sewn. */
    linear-gradient(
        180deg,
        transparent 0 22%,
        color-mix(in srgb, var(--lb-pearl) 66%, transparent) 22% 25%,
        transparent 25% 48%,
        color-mix(in srgb, var(--lb-pearl) 66%, transparent) 48% 51%,
        transparent 51% 74%,
        color-mix(in srgb, var(--lb-pearl) 66%, transparent) 74% 77%,
        transparent 77%
      )
      left top / 0.6rem 100% no-repeat,
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--lb-rose) 52%, var(--lb-blush)) 0 0.6rem,
      transparent 0.6rem
    ),
    /* Woven cloth: a warp and a weft of hairlines instead of a flat fill. */
    repeating-linear-gradient(
      45deg,
      color-mix(in srgb, var(--lb-pearl) 26%, transparent) 0 1px,
      transparent 1px 4px
    ),
    repeating-linear-gradient(
      -45deg,
      color-mix(in srgb, var(--lb-rose) 12%, transparent) 0 1px,
      transparent 1px 4px
    ),
    linear-gradient(
      152deg,
      color-mix(in srgb, var(--lb-blush) 88%, var(--lb-pearl)),
      color-mix(in srgb, var(--lb-rose) 30%, var(--lb-blush))
    );
  box-shadow: inset 0 0 0 1px rgb(255 251 252 / 55%);
  transform-origin: 0 50%;
  transform-style: preserve-3d;
  backface-visibility: visible;
  transition:
    opacity 420ms ease,
    transform 1s var(--lb-paper-ease);
}
/* A stitched line just inside the cover edge, echoing the page rules. */
.lb-root .ie-envelope-flap::after {
  position: absolute;
  inset: 0.55rem 0.45rem 0.55rem 1.05rem;
  border: 1px dashed color-mix(in srgb, var(--lb-trim) 58%, transparent);
  border-radius: 0.2rem;
  content: "";
}
/*
 * Satin catching the light. Animated through background-position rather than a transform so the
 * highlight can never paint outside the cover: clipping it would need overflow or clip-path, and
 * either would flatten the flap's 3D context and break the cover plate's backface. One pass every
 * nine seconds on a small element, only while the book is closed.
 */
.lb-root .ie-envelope-flap::before {
  position: absolute;
  z-index: 2;
  inset: 0;
  background: linear-gradient(
    104deg,
    transparent 42%,
    rgb(255 251 252 / 46%) 50%,
    transparent 58%
  );
  background-position: 135% 0;
  background-size: 260% 100%;
  border-radius: inherit;
  content: "";
  pointer-events: none;
}
.lb-root
  .ie-root[data-motion-enabled="true"][data-opening-state="closed"]
  .ie-envelope-flap::before {
  animation: lb-cover-sheen 9s ease-in-out infinite;
}
@keyframes lb-cover-sheen {
  0%,
  58% { background-position: 135% 0; }
  88%,
  100% { background-position: -35% 0; }
}

/*
 * The cover plate. Sits in the upper half so the ribbon cross-tie passes below it, and grows
 * downward from a fixed top edge so a long name or date can never be clipped.
 */
.lb-cover-plate {
  position: absolute;
  z-index: 3;
  inset: 9% 9% auto 19%;
  display: grid;
  justify-items: center;
  gap: 0.3rem;
  padding: 0.7rem 0.55rem;
  border: 1px solid var(--lb-hairline);
  background:
    linear-gradient(135deg, var(--lb-corner) 0 0.4rem, transparent 0.4rem) left top / 0.85rem
      0.85rem no-repeat,
    linear-gradient(225deg, var(--lb-corner) 0 0.4rem, transparent 0.4rem) right top / 0.85rem
      0.85rem no-repeat,
    linear-gradient(45deg, var(--lb-corner) 0 0.4rem, transparent 0.4rem) left bottom / 0.85rem
      0.85rem no-repeat,
    linear-gradient(315deg, var(--lb-corner) 0 0.4rem, transparent 0.4rem) right bottom / 0.85rem
      0.85rem no-repeat,
    var(--lb-pearl);
  box-shadow: 0 0.25rem 0.6rem color-mix(in srgb, var(--lb-ink) 14%, transparent);
  text-align: center;
  /* The plate is on the outside of the cover, so it leaves once the cover turns past its plane. */
  backface-visibility: hidden;
}
.lb-cover-eyebrow,
.lb-cover-date {
  color: var(--lb-label);
  font-size: clamp(0.34rem, 1.35cqi, 0.46rem);
  font-weight: 740;
  letter-spacing: 0.16em;
  line-height: 1.5;
  text-transform: uppercase;
}
.lb-cover-name {
  overflow-wrap: anywhere;
  color: var(--lb-ink);
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(0.85rem, 3.6cqi, 1.25rem);
  font-weight: 430;
  line-height: 1.12;
}
.lb-cover-date {
  padding-top: 0.34rem;
  border-top: 1px solid var(--lb-hairline);
  justify-self: stretch;
}
.lb-root .ie-root[data-opening-state="opening"] .ie-envelope-flap,
.lb-root .ie-root[data-opening-state="letter-revealing"] .ie-envelope-flap,
.lb-root .ie-root[data-opening-state="opened"] .ie-envelope-flap {
  z-index: 2;
  opacity: 1;
  transform: rotateY(-108deg);
}
/* The book slides right as the cover swings, the way a spine shifts when a real cover opens. */
.lb-root .ie-root[data-opening-state="opening"] .ie-envelope,
.lb-root .ie-root[data-opening-state="letter-revealing"] .ie-envelope,
.lb-root .ie-root[data-opening-state="opened"] .ie-envelope {
  transform: translateX(21%);
  transition: transform 1s var(--lb-paper-ease);
}
/*
 * Page one. It lingers and grows as the book dissolves, then hands over to the invitation -
 * the same letter flow Garden Promise uses, kept for this family deliberately.
 */
.lb-root .ie-letter {
  z-index: 3;
  inset: 8% 9% 10% 14%;
  padding: 20% 11% 15%;
  border: 1px solid var(--lb-hairline);
  border-radius: 0.1rem;
  background: var(--lb-pearl);
  box-shadow: 0 0.6rem 1.4rem color-mix(in srgb, var(--lb-ink) 10%, transparent);
  /* A stitched inner border, drawn as an inset outline so both pseudo-elements stay free. */
  outline: 1px dashed var(--lb-stitch);
  outline-offset: -0.55rem;
  text-align: left;
  transform: translateY(8%) scale(0.99);
  transition:
    box-shadow 1.1s ease,
    opacity 460ms ease 900ms,
    transform 1.4s var(--lb-paper-ease);
}
/* Page one carries the same chapter mark the pages below it use. */
.lb-root .ie-letter::before {
  position: absolute;
  top: 8.5%;
  left: 11%;
  padding-bottom: 0.22rem;
  border-bottom: 1px solid var(--lb-hairline);
  color: var(--lb-label);
  content: "one";
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(0.5rem, 1.9cqi, 0.72rem);
  line-height: 1;
}
.lb-root .ie-letter strong {
  /* Written on ruled lines, the way a memory book's fill-in page is set. */
  background-image: repeating-linear-gradient(
    180deg,
    transparent 0 calc(1.34em - 1px),
    var(--lb-hairline) calc(1.34em - 1px) 1.34em
  );
  color: var(--lb-ink);
  font-weight: 440;
  line-height: 1.34;
}
.lb-root .ie-letter span,
.lb-root .ie-letter small {
  color: var(--lb-label);
}
.lb-root .ie-letter small {
  padding-top: 0.6rem;
  border-top: 1px solid var(--lb-hairline);
}
/* A pressed bloom laid in the foot of the page. */
@supports (mask-image: url("")) or (-webkit-mask-image: url("")) {
  .lb-root .ie-letter::after {
    position: absolute;
    right: 10%;
    bottom: 6%;
    width: clamp(1.5rem, 6.5cqi, 2.3rem);
    aspect-ratio: 1;
    background-color: color-mix(in srgb, var(--lb-rose) 20%, transparent);
    content: "";
    pointer-events: none;
    rotate: 12deg;
    -webkit-mask-image: var(--lb-bloom);
    mask-image: var(--lb-bloom);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: contain;
    mask-size: contain;
  }
}
/* The ribbon tie holding the book closed. */
.lb-root .ie-ribbon {
  background: color-mix(in srgb, var(--lb-rose) 68%, var(--lb-trim));
}
.lb-root .ie-ribbon-horizontal {
  top: 48%;
  height: 4.2%;
}
/*
 * A book is tied with a single band around its middle, not a parcel cross — and the cross band
 * would run straight through the cover plate's title. The shared vertical band is dropped for this
 * family; the untying beat still reads through the knot, loops, tails, and the horizontal band.
 */
.lb-root .ie-ribbon-vertical {
  display: none;
}
.lb-root .ie-ribbon-knot {
  top: 48%;
  color: color-mix(in srgb, var(--lb-trim) 60%, var(--lb-rose));
  transform: translate(-50%, -26%);
}
.lb-root .ie-ribbon-loop {
  width: 1.05rem;
  height: 0.78rem;
  border-width: 0.24rem;
}
.lb-root .ie-ribbon-loop-left { right: 0.8rem; }
.lb-root .ie-ribbon-loop-right { left: 0.8rem; }
.lb-root .ie-ribbon-tail {
  width: 0.3rem;
  height: 1.35rem;
}
.lb-root .ie-ribbon-knot i {
  inset: 0.52rem;
  box-shadow: 0 0 0 0.15rem rgb(255 251 252 / 85%);
}

/* Page one lingers and grows while the book dissolves behind it. */
.lb-root .ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-letter {
  z-index: 7;
  opacity: 0;
  box-shadow: 0 1.8rem 4rem color-mix(in srgb, var(--lb-ink) 16%, transparent);
  transform: translateY(-14%) scale(1.22);
}
.lb-root .ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-envelope-flap {
  opacity: 0;
  transform: rotateY(-108deg) translateZ(0.5rem);
}
.lb-root .ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-content {
  animation: lb-content-takeover 1400ms linear both;
}
@keyframes lb-content-takeover {
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

/* Soft falling petals drift behind the book as a gentle ambient layer in the opening only. */
.lb-petals {
  position: absolute;
  z-index: 0;
  inset: -20% -24% -10%;
  overflow: hidden;
  pointer-events: none;
}
.lb-petal {
  position: absolute;
  top: -8%;
  width: 0.85rem;
  height: 0.85rem;
  background: radial-gradient(
    circle at 32% 28%,
    var(--lb-pearl),
    color-mix(in srgb, var(--lb-rose) 62%, var(--lb-pearl))
  );
  border-radius: 60% 60% 62% 38% / 62% 62% 38% 38%;
  opacity: 0;
  transform: translateY(-10%) rotate(0deg);
  animation: lb-petal-fall linear infinite;
}
.lb-petal:nth-child(1) { left: 8%; width: 0.7rem; height: 0.7rem; animation-duration: 11s; animation-delay: -1s; }
.lb-petal:nth-child(2) { left: 20%; animation-duration: 13s; animation-delay: -5s; }
.lb-petal:nth-child(3) { left: 33%; width: 0.6rem; height: 0.6rem; animation-duration: 15s; animation-delay: -9s; }
.lb-petal:nth-child(4) { left: 46%; animation-duration: 12s; animation-delay: -3s; }
.lb-petal:nth-child(5) { left: 58%; width: 1rem; height: 1rem; animation-duration: 16s; animation-delay: -7s; }
.lb-petal:nth-child(6) { left: 70%; width: 0.65rem; height: 0.65rem; animation-duration: 12.5s; animation-delay: -11s; }
.lb-petal:nth-child(7) { left: 82%; animation-duration: 14s; animation-delay: -2s; }
.lb-petal:nth-child(8) { left: 90%; width: 0.7rem; height: 0.7rem; animation-duration: 10.5s; animation-delay: -6s; }
.lb-petal:nth-child(9) { left: 14%; width: 0.9rem; height: 0.9rem; animation-duration: 17s; animation-delay: -13s; }
@keyframes lb-petal-fall {
  0% { opacity: 0; transform: translateY(-10%) translateX(0) rotate(0deg); }
  12% { opacity: 0.85; }
  88% { opacity: 0.7; }
  100% { opacity: 0; transform: translateY(560%) translateX(1.5rem) rotate(220deg); }
}
.lb-root[data-opening-state="untying"] .lb-petal,
.lb-root[data-opening-state="opening"] .lb-petal { animation-duration: 6s; }

/* Skip control for the longer cinematic opening (mirrors the shared opener contract). */
.lb-root .ie-skip-opening {
  position: absolute;
  z-index: 12;
  right: clamp(0.9rem, 3cqi, 1.6rem);
  bottom: clamp(0.9rem, 3cqi, 1.6rem);
  min-height: 2.75rem;
  padding: 0.5rem 1.1rem;
  border: 1px dashed color-mix(in srgb, var(--lb-trim) 70%, transparent);
  border-radius: 0.2rem;
  background: color-mix(in srgb, var(--lb-pearl) 86%, transparent);
  color: color-mix(in srgb, var(--lb-ink) 82%, transparent);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 640;
  letter-spacing: 0.06em;
  cursor: pointer;
}
.lb-root .ie-skip-opening:hover {
  border-color: color-mix(in srgb, var(--lb-rose) 76%, transparent);
  background: var(--lb-pearl);
}
.lb-root .ie-skip-opening:focus-visible {
  outline: 3px solid var(--lb-ink);
  outline-offset: 3px;
}

/* ------------------------------------------------------------------ the pages */

/*
 * The leaves. Everything past the cover is set on pearl paper bound into the pink cloth, so the
 * body continues the letter that came out of the envelope instead of resuming on the cover itself.
 * The cloth stays visible as a margin on all four sides, and the binding is drawn at the leaves'
 * left edge: a dusty spine, the gutter shadow where the paper turns into the fold, and two rows of
 * stitching sewn through the signature.
 *
 * The leaf is painted by a pseudo-element at z-index -2 rather than as a background on the element
 * itself. Each page's pressed flower sits at z-index -1, and both escape to .lb-root's stacking
 * context (it is the only isolated ancestor), so -2 keeps the paper behind the flowers. Isolating
 * .lb-section instead would trap the fixed-position gallery lightbox beneath later sections.
 */
.lb-content,
.lb-footer {
  position: relative;
  width: min(calc(100% - var(--lb-leaf-inset) * 2), 44rem);
  margin-inline: auto;
}
.lb-content::before,
.lb-footer::before {
  position: absolute;
  z-index: -2;
  inset: 0;
  background:
    repeating-linear-gradient(
        180deg,
        var(--lb-stitch) 0 0.34rem,
        transparent 0.34rem 0.72rem
      )
      0.62rem 0 / 1px 100% no-repeat,
    repeating-linear-gradient(
        180deg,
        var(--lb-stitch) 0 0.34rem,
        transparent 0.34rem 0.72rem
      )
      0.98rem 0 / 1px 100% no-repeat,
    linear-gradient(
        90deg,
        color-mix(in srgb, var(--lb-trim) 58%, var(--lb-blush)) 0 0.4rem,
        transparent 0.4rem
      )
      no-repeat,
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--lb-trim) 30%, transparent) 0.4rem,
      transparent 2.2rem
    ),
    repeating-linear-gradient(
      90deg,
      color-mix(in srgb, var(--lb-trim) 5%, transparent) 0 1px,
      transparent 1px 5px
    ),
    var(--lb-pearl);
  box-shadow: inset -1px 0 0 color-mix(in srgb, var(--lb-trim) 30%, transparent);
  content: "";
  pointer-events: none;
}
/* Only the first leaf shows a head edge; the colophon continues the same sheet below it. */
.lb-content::before {
  box-shadow:
    inset -1px 0 0 color-mix(in srgb, var(--lb-trim) 30%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--lb-trim) 30%, transparent);
}
.lb-content {
  padding: 0 var(--lb-gutter) clamp(2rem, 6cqi, 3rem);
  counter-reset: lb-page;
  outline: 0;
}
.lb-content:focus-visible {
  box-shadow: inset 0 0 0 3px var(--lb-rose);
}

.lb-section {
  --lb-page-space: var(--lb-space-standard);
  position: relative;
  padding: var(--lb-page-space) 0;
  counter-increment: lb-page;
  text-align: left;
}
/* Page breaks are stitched, not ornamented. */
.lb-section + .lb-section {
  border-top: 1px dashed var(--lb-stitch);
}
.lb-section[data-section-type="hero"],
.lb-section[data-section-type="rsvp"] {
  --lb-page-space: var(--lb-space-feature);
}
.lb-section[data-section-type="countdown"],
.lb-section[data-section-type="attire"],
.lb-section[data-section-type="guidance"] {
  --lb-page-space: var(--lb-space-compact);
}
/*
 * The chapter mark. Silenced for assistive technology with the empty content alternative so the
 * page numbering never interrupts the heading it introduces.
 */
.lb-section::before {
  display: block;
  width: max-content;
  min-width: 2.4rem;
  margin-bottom: clamp(1.1rem, 3.4cqi, 1.7rem);
  padding-bottom: 0.42rem;
  border-bottom: 1px solid var(--lb-hairline);
  content: counter(lb-page, upper-roman) / "";
  color: var(--lb-label);
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: 0.95rem;
  font-weight: 420;
  letter-spacing: 0.01em;
  line-height: 1;
}

.lb-section h1,
.lb-section h2,
.lb-section h3 {
  margin: 0;
  font-family: "Fraunces Variable", Georgia, serif;
  font-weight: 450;
  letter-spacing: -0.02em;
  line-height: 1.12;
  text-wrap: balance;
}
.lb-section h1 { font-size: clamp(2.4rem, 9cqi, 4rem); }
.lb-section h2 { font-size: clamp(1.5rem, 4.6cqi, 2.15rem); }
.lb-section h3 { font-size: clamp(1.05rem, 3cqi, 1.3rem); }
.lb-section p,
.lb-section address {
  max-width: 34rem;
  margin: 0.85rem 0 0;
  color: var(--lb-muted);
}
.lb-section address { font-style: normal; }
.lb-eyebrow {
  margin: 0;
  color: var(--lb-label);
  font-size: 0.66rem;
  font-weight: 740;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

/*
 * Pressed flowers, as though laid between the pages. They sit in the empty top-right of each page
 * opening — never under a paragraph — behind the content at low opacity, and are absent from the
 * accessibility tree. Skipped on the hero, whose portrait plate already fills that corner.
 */
@supports (mask-image: url("")) or (-webkit-mask-image: url("")) {
  .lb-section::after {
    position: absolute;
    z-index: -1;
    top: calc(var(--lb-page-space) * 0.25);
    right: 0;
    width: clamp(3.1rem, 11cqi, 4.75rem);
    aspect-ratio: 1;
    /* Rose reads heavier than the rose-silver trim, so the bloom is mixed weaker to match it. */
    background-color: color-mix(in srgb, var(--lb-rose) 15%, transparent);
    content: "";
    pointer-events: none;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: contain;
    mask-size: contain;
  }
  .lb-section:nth-child(odd)::after {
    -webkit-mask-image: var(--lb-bloom);
    mask-image: var(--lb-bloom);
    rotate: -12deg;
  }
  .lb-section:nth-child(even)::after {
    width: clamp(2.6rem, 9cqi, 4rem);
    background-color: color-mix(in srgb, var(--lb-trim) 30%, transparent);
    -webkit-mask-image: var(--lb-sprig);
    mask-image: var(--lb-sprig);
    rotate: 14deg;
  }
  .lb-section[data-section-type="hero"]::after {
    content: none;
  }
}

/* On wider pages the chapter mark moves out into a true margin rail. */
@container (min-width: 38rem) {
  .lb-section {
    padding-left: var(--lb-rail);
  }
  .lb-section::before {
    position: absolute;
    top: calc(var(--lb-page-space) + 0.3rem);
    left: 0;
    width: calc(var(--lb-rail) - 1.1rem);
    min-width: 0;
    margin-bottom: 0;
  }
}

/* --------------------------------------------------------------------- page one */

.lb-hero {
  display: grid;
  gap: clamp(1.4rem, 4cqi, 2rem);
}
/*
 * The portrait is a mounted plate: a pearl mat, a hairline rule, stitched outside, and the same
 * four paper corners that hold the cover plate and every picture further into the book. The mat is
 * narrower than the album plates', so the corners overlap the portrait slightly — which is how a
 * real photo corner holds a print.
 */
.lb-hero-frame {
  position: relative;
  display: grid;
  width: min(100%, 21rem);
  padding: clamp(0.5rem, 1.8cqi, 0.85rem);
  border: 1px solid var(--lb-hairline);
  background:
    linear-gradient(135deg, var(--lb-corner) 0 0.32rem, transparent 0.32rem) left top / 0.7rem
      0.7rem no-repeat,
    linear-gradient(225deg, var(--lb-corner) 0 0.32rem, transparent 0.32rem) right top / 0.7rem
      0.7rem no-repeat,
    linear-gradient(45deg, var(--lb-corner) 0 0.32rem, transparent 0.32rem) left bottom / 0.7rem
      0.7rem no-repeat,
    linear-gradient(315deg, var(--lb-corner) 0 0.32rem, transparent 0.32rem) right bottom / 0.7rem
      0.7rem no-repeat,
    var(--lb-pearl);
  box-shadow: 0 0.7rem 1.6rem color-mix(in srgb, var(--lb-ink) 8%, transparent);
}
.lb-hero-frame[data-photo-orientation="square"] { width: min(100%, 24rem); }
.lb-hero-frame[data-photo-orientation="landscape"] { width: min(100%, 32rem); }
.lb-hero-frame::after {
  position: absolute;
  inset: -0.42rem;
  border: 1px dashed color-mix(in srgb, var(--lb-trim) 50%, transparent);
  content: "";
  pointer-events: none;
}
.lb-hero-photo-trigger {
  display: grid;
  width: 100%;
  min-height: 2.75rem;
  overflow: hidden;
  cursor: zoom-in;
  place-items: center;
  text-decoration: none;
}
.lb-hero-photo-trigger:focus-visible {
  outline: 3px solid var(--lb-ink);
  outline-offset: 0.22rem;
}
.lb-hero-frame .lb-hero-image {
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: min(70svh, 36rem);
  margin-inline: auto;
  object-fit: contain;
}
.lb-hero-head {
  display: grid;
  justify-items: start;
}
.lb-hero h1 {
  display: grid;
  margin-top: 0.5rem;
  line-height: 0.98;
}
.lb-hero-name {
  font-size: clamp(2.8rem, 10.5cqi, 4.6rem);
  font-weight: 400;
  /* 70% rose over ink holds 3.39:1 - above the 3:1 large-text floor at this size. */
  color: color-mix(in srgb, var(--lb-rose) 70%, var(--lb-ink));
}
.lb-hero-surname {
  margin-top: 0.22em;
  font-size: clamp(1.05rem, 3.2cqi, 1.5rem);
  font-weight: 620;
  font-style: normal;
  letter-spacing: 0.26em;
  text-transform: uppercase;
}
.lb-hero-copy { max-width: 27rem; }
.lb-hero time {
  display: block;
  margin-top: 1.3rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--lb-hairline);
  color: var(--lb-label);
  font-size: 0.72rem;
  font-weight: 720;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

/* ------------------------------------------------------------------- dedication */

/* The blessing reads as a book dedication: a heading label, then set text with a drop-cap. */
.lb-message h2 {
  color: var(--lb-label);
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
  font-size: 0.66rem;
  font-weight: 740;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.lb-message > p {
  max-width: 32rem;
  margin-top: 1.1rem;
  color: var(--lb-ink);
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.1rem, 3.4cqi, 1.4rem);
  line-height: 1.68;
  text-wrap: pretty;
}
.lb-message > p::first-letter {
  float: left;
  margin: 0.08em 0.14em -0.04em 0;
  font-size: 3.2em;
  font-style: normal;
  font-weight: 460;
  line-height: 0.8;
  color: color-mix(in srgb, var(--lb-rose) 70%, var(--lb-ink));
}
/* The dedication is signed, so the note reads as written by the parents rather than about them. */
.lb-signature {
  max-width: 32rem;
  margin-top: 1.7rem;
  padding-top: 0.95rem;
  border-top: 1px solid var(--lb-hairline);
}
.lb-signature > span {
  display: block;
  color: var(--lb-label);
  font-size: 0.66rem;
  font-weight: 740;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.lb-signature p {
  display: grid;
  margin-top: 0.5rem;
  overflow-wrap: anywhere;
  color: var(--lb-ink);
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.05rem, 3cqi, 1.25rem);
  justify-items: start;
  line-height: 1.4;
}

/* --------------------------------------------------------------------- countdown */

/* Pressed date chips: square, pearl, tabular - stationery, not tiles. */
.lb-countdown-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1.3rem 0 0;
  padding: 0;
  list-style: none;
}
.lb-countdown-tiles li {
  display: grid;
  min-width: clamp(3.4rem, 15cqi, 4.4rem);
  gap: 0.3rem;
  padding: 0.7rem 0.55rem 0.6rem;
  border: 1px solid var(--lb-hairline);
  border-radius: 0.15rem;
  background: var(--lb-pearl);
}
.lb-countdown-tiles span {
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.5rem, 5.2cqi, 2.2rem);
  font-weight: 450;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--lb-ink);
}
.lb-countdown-tiles small {
  color: var(--lb-label);
  font-size: 0.6rem;
  font-weight: 720;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.lb-countdown-remaining {
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.4rem, 4.6cqi, 2rem);
  color: var(--lb-ink);
}
.lb-countdown time {
  display: block;
  margin-top: 1rem;
  color: var(--lb-label);
  font-size: 0.72rem;
  font-weight: 720;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

/* ------------------------------------------------------------ venues and details */

/* Venues are pages within the page: stitched-off blocks, never floating cards. */
.lb-event-grid {
  display: grid;
  gap: clamp(1.5rem, 4.5cqi, 2.25rem);
  margin-top: 1.5rem;
}
.lb-event-grid > article {
  min-width: 0;
  padding-top: clamp(1.4rem, 4cqi, 1.9rem);
  border-top: 1px dashed var(--lb-stitch);
}
.lb-event-grid > article:first-child {
  padding-top: 0;
  border-top: 0;
}
.lb-event-grid time {
  display: block;
  margin-top: 0.55rem;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.35rem, 4.2cqi, 1.8rem);
  line-height: 1;
}
.lb-event-grid h3 { margin-top: 0.65rem; }
.lb-event-grid address { margin-top: 0.3rem; }
.lb-event-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.2rem;
}
.lb-action {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 1.05rem;
  border-radius: 0.15rem;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 660;
  letter-spacing: 0.04em;
  text-decoration: none;
  cursor: pointer;
}
/* Deep enough against the pearl-white label to clear WCAG AA at this control's size. */
.lb-action-calendar {
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--lb-rose) 55%, var(--lb-ink));
  color: var(--lb-rose-contrast);
}
.lb-action-calendar:hover {
  background: color-mix(in srgb, var(--lb-rose) 45%, var(--lb-ink));
}
.lb-action-directions {
  border: 1px solid color-mix(in srgb, var(--lb-rose) 52%, transparent);
  background: var(--lb-pearl);
  color: color-mix(in srgb, var(--lb-rose) 42%, var(--lb-ink));
}
.lb-action-directions::after {
  content: "\\2192";
  font-weight: 500;
}
.lb-action-directions:hover {
  border-color: color-mix(in srgb, var(--lb-rose) 72%, transparent);
  background: color-mix(in srgb, var(--lb-blush) 34%, var(--lb-pearl));
}
.lb-action:focus-visible {
  outline: 3px solid var(--lb-ink);
  outline-offset: 3px;
}

/* Click-to-load venue map: a quiet tertiary control below the two actions. */
.lb-root .im-toggle {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  padding: 0.4rem 0.2rem;
  border: 0;
  background: none;
  color: color-mix(in srgb, var(--lb-rose) 52%, var(--lb-ink));
  font: inherit;
  font-size: 0.72rem;
  font-weight: 660;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}
.lb-root .im-toggle::after {
  content: "";
  display: block;
  height: 1px;
  margin-left: 0.5rem;
  background: color-mix(in srgb, var(--lb-trim) 74%, transparent);
  inline-size: 1.6rem;
}
.lb-root .im-toggle:hover { color: var(--lb-ink); }
.lb-root .im-toggle:focus-visible {
  outline: 3px solid var(--lb-ink);
  outline-offset: 3px;
}
.lb-root .im-panel {
  overflow: hidden;
  padding: 0.4rem;
  border: 1px solid var(--lb-hairline);
  border-radius: 0.15rem;
  background: var(--lb-pearl);
}
.lb-root .im-canvas {
  height: clamp(12rem, 44cqi, 16rem);
  border-radius: 0.1rem;
}
.lb-root .im-notice {
  padding: 0 0.5rem 0.35rem;
  color: var(--lb-muted);
}
.lb-root .im-pin-body { fill: var(--lb-rose); }
.lb-root .im-pin-dot { fill: var(--lb-pearl); }
.lb-root .leaflet-container { background: color-mix(in srgb, var(--lb-blush) 40%, #e7e2e4); }
.lb-root .leaflet-bar {
  border: 1px solid var(--lb-hairline);
  box-shadow: 0 0.3rem 0.8rem color-mix(in srgb, var(--lb-ink) 12%, transparent);
}
.lb-root .leaflet-bar a {
  border-bottom-color: var(--lb-hairline);
  background: var(--lb-pearl);
  color: var(--lb-ink);
}
.lb-root .leaflet-bar a:hover { background: color-mix(in srgb, var(--lb-blush) 46%, var(--lb-pearl)); }
.lb-root .leaflet-control-attribution {
  background: color-mix(in srgb, var(--lb-pearl) 88%, transparent);
  color: color-mix(in srgb, var(--lb-ink) 80%, transparent);
}
.lb-root .leaflet-control-attribution a { color: color-mix(in srgb, var(--lb-rose) 30%, var(--lb-ink)); }

/* ------------------------------------------------------------------- family list */

.lb-participant-grid {
  display: grid;
  gap: clamp(1.4rem, 4cqi, 2rem);
  margin-top: 1.5rem;
}
.lb-participant-grid > div { min-width: 0; }
.lb-participant-grid h3 {
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--lb-hairline);
  font-size: 0.68rem;
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
  font-weight: 740;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--lb-label);
}
.lb-participant-grid ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.lb-participant-grid li {
  padding: 0.55rem 0;
  overflow-wrap: anywhere;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.05rem, 3cqi, 1.25rem);
}
.lb-participant-grid li + li {
  border-top: 1px dashed color-mix(in srgb, var(--lb-trim) 38%, transparent);
}
/* Two sponsor groups read as two columns once there is room for them side by side. */
@container (min-width: 38rem) {
  .lb-participant-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(1.4rem, 4cqi, 2.5rem);
  }
}

/* --------------------------------------------------------------------- the agenda */

/*
 * Order of the day as a ruled agenda. Every line is read time-first — "8:40 AM  Guests arrive" —
 * with the two columns sharing a baseline so the pair scans as one line rather than a small label
 * stacked over a heading. The time and the description are given their own classes on purpose: the
 * time is a paragraph too, so a bare .lb-schedule p rule places it in the description's column.
 */
.lb-schedule ol {
  margin: 1.4rem 0 0;
  padding: 0;
  list-style: none;
}
.lb-schedule li {
  display: grid;
  grid-template-columns: minmax(4.9rem, max-content) 1fr;
  align-items: baseline;
  gap: 0.2rem 1rem;
  padding: 0.85rem 0;
  border-top: 1px dashed color-mix(in srgb, var(--lb-trim) 40%, transparent);
}
.lb-schedule li:first-child { border-top: 0; padding-top: 0; }
/*
 * The time is set in the same serif as the moment it introduces, at full ink, so it leads the line
 * instead of labelling it. Tabular figures hold every time on one optical column.
 */
.lb-schedule .lb-schedule-time {
  grid-column: 1;
  max-width: none;
  margin: 0;
  color: var(--lb-ink);
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(0.95rem, 2.7cqi, 1.15rem);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1.2;
}
.lb-schedule h3 {
  grid-column: 2;
  font-weight: 430;
}
.lb-schedule .lb-schedule-note {
  grid-column: 2;
  margin-top: 0.15rem;
}

/* ------------------------------------------------------------------------- reply */

/*
 * The reply page is the one block that is a card, because it is the one thing to act on. Now that
 * the leaves are pearl it is tinted blush rather than lifted in pearl, so it still reads as a reply
 * card tipped onto the page instead of dissolving into it. Muted ink on that tint is 5.32:1.
 */
.lb-rsvp time {
  display: block;
  margin-top: 1rem;
  color: var(--lb-label);
  font-size: 0.74rem;
  font-weight: 720;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.lb-rsvp [data-rsvp-slot] {
  max-width: 30rem;
  margin-top: 1.5rem;
  padding: clamp(1rem, 3.5cqi, 1.5rem);
  border: 1px solid var(--lb-hairline);
  border-radius: 0.15rem;
  background: color-mix(in srgb, var(--lb-blush) 30%, var(--lb-pearl));
  box-shadow: 0 0.6rem 1.4rem color-mix(in srgb, var(--lb-ink) 7%, transparent);
  font-size: 0.78rem;
}

/* -------------------------------------------------------------------------- attire */

.lb-color-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.1rem;
  margin: 1.2rem 0 0;
  padding: 0;
  list-style: none;
}
.lb-color-list li {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.9rem;
}
.lb-color-list span {
  width: 1.4rem;
  height: 1.4rem;
  border: 1px solid color-mix(in srgb, var(--lb-trim) 62%, transparent);
  border-radius: 0.1rem;
  box-shadow: inset 0 0 0 2px rgb(255 251 252 / 75%);
}

/*
 * Two audiences, two dress codes, both shown to everyone. Set with the sponsor lists' label idiom
 * on page five so the reader recognizes them as the same kind of thing — a named group followed by
 * what applies to it — and side by side once there is room, for the same reason.
 */
.lb-attire-groups {
  display: grid;
  gap: clamp(1.4rem, 4cqi, 2rem);
  margin-top: clamp(1.6rem, 5cqi, 2.4rem);
}
.lb-attire-groups > div { min-width: 0; }
.lb-attire-groups h3 {
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--lb-hairline);
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
  font-size: 0.68rem;
  font-weight: 740;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--lb-label);
}
.lb-attire-groups p { margin-top: 0.85rem; }
.lb-attire-groups .lb-color-list { margin-top: 0.9rem; }
@container (min-width: 38rem) {
  .lb-attire-groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* ------------------------------------------------------------------------ gallery */

/*
 * Photographs on page nine and gift pictures on page eleven are mounted on one shared track, so the
 * two picture pages read as a single album.
 *
 * Pinned to two columns rather than auto-fit: with auto-fit the rendered column count is unknown to
 * CSS, so an odd final plate cannot be centred. Two up is what already rendered on a phone, and it
 * suits a book page better than a wide contact sheet. The container threshold is expressed in rem
 * so scaled text still collapses the album to one column, where a lone plate is full width anyway
 * and there is nothing left to centre.
 */
.lb-gallery-grid,
.lb-gift-grid {
  --lb-plate-gap: clamp(0.9rem, 3cqi, 1.5rem);
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--lb-plate-gap);
  margin-top: 1.5rem;
}
@container (min-width: 14rem) {
  .lb-gallery-grid,
  .lb-gift-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* An unpaired last plate sits centred on the page at the width of a paired one. */
  .lb-gallery-grid > figure:last-child:nth-child(odd),
  .lb-gift-grid > article:last-child:nth-child(odd) {
    grid-column: 1 / -1;
    width: calc(50% - var(--lb-plate-gap) / 2);
    margin-inline: auto;
  }
}
.lb-gallery-grid figure {
  min-width: 0;
  margin: 0;
}
/*
 * Mounted plates. Every picture in the book — photographs on page nine, gift pictures on page
 * eleven — is tipped onto the leaf with the four paper corners that hold the cover plate, so the
 * cover's own language repeats inside. The corners are drawn in the plate's padding, which is why
 * the padding and the corner size are set together.
 */
.lb-gallery-trigger,
.lb-gift-photo-trigger,
.lb-gallery-grid .lb-media-placeholder,
.lb-gift-grid .lb-media-placeholder {
  width: 100%;
  margin: 0;
  padding: 0.55rem;
  border: 1px solid var(--lb-hairline);
  border-radius: 0;
  background:
    linear-gradient(135deg, var(--lb-corner) 0 0.32rem, transparent 0.32rem) left top / 0.7rem
      0.7rem no-repeat,
    linear-gradient(225deg, var(--lb-corner) 0 0.32rem, transparent 0.32rem) right top / 0.7rem
      0.7rem no-repeat,
    linear-gradient(45deg, var(--lb-corner) 0 0.32rem, transparent 0.32rem) left bottom / 0.7rem
      0.7rem no-repeat,
    linear-gradient(315deg, var(--lb-corner) 0 0.32rem, transparent 0.32rem) right bottom / 0.7rem
      0.7rem no-repeat,
    var(--lb-pearl);
  box-shadow: 0 0.2rem 0.5rem color-mix(in srgb, var(--lb-ink) 8%, transparent);
}
/* A plate still awaiting its picture keeps its dashed signal, now drawn inside the mount. */
.lb-gallery-grid .lb-media-placeholder,
.lb-gift-grid .lb-media-placeholder {
  outline: 1px dashed var(--lb-stitch);
  outline-offset: -0.55rem;
}
.lb-gallery-trigger,
.lb-gift-photo-trigger {
  display: block;
  color: inherit;
  text-decoration: none;
}
.lb-gallery-trigger,
.lb-gift-photo-trigger {
  cursor: zoom-in;
}
.lb-gallery-trigger:focus-visible,
.lb-gift-photo-trigger:focus-visible {
  outline: 3px solid var(--lb-ink);
  outline-offset: 0.25rem;
}
/*
 * The writing under a plate is handwriting on a page, not a card's text slot: both lines are
 * optional, nothing is reserved when they are absent, and a plate with neither emits no figcaption
 * at all. The grid gap collapses on its own when only one line is present, so a lone title needs no
 * special case beyond balancing its wrap. A lone caption deliberately keeps its muted voice rather
 * than being promoted to the title's serif — an offhand remark should not be dressed as a label.
 */
.lb-gallery-grid figcaption {
  display: grid;
  gap: 0.2rem;
  margin-top: 0.55rem;
  font-size: 0.8rem;
  overflow-wrap: break-word;
}
.lb-gallery-grid figcaption strong {
  font-family: "Fraunces Variable", Georgia, serif;
  font-weight: 460;
  text-wrap: balance;
}
.lb-gallery-grid figcaption span { color: var(--lb-muted); }

/*
 * Reveal-once entrance: plates settle onto the page. Without the data-reveal attribute
 * (SSR / no-JS / reduced motion) the figures are simply visible.
 */
.lb-gallery[data-reveal="armed"] .lb-gallery-grid figure {
  opacity: 0;
  transform: translateY(0.9rem);
}
.lb-gallery[data-reveal="revealed"] .lb-gallery-grid figure {
  opacity: 1;
  transform: none;
  transition:
    opacity 560ms ease,
    transform 620ms var(--lb-paper-ease);
}
.lb-gallery[data-reveal="revealed"] .lb-gallery-grid figure:nth-child(2) { transition-delay: 80ms; }
.lb-gallery[data-reveal="revealed"] .lb-gallery-grid figure:nth-child(3) { transition-delay: 160ms; }
.lb-gallery[data-reveal="revealed"] .lb-gallery-grid figure:nth-child(4) { transition-delay: 240ms; }
.lb-gallery[data-reveal="revealed"] .lb-gallery-grid figure:nth-child(n + 5) { transition-delay: 320ms; }

.lb-photo-preview {
  --ip-backdrop: color-mix(in srgb, var(--lb-ink) 86%, transparent);
  --ip-surface: var(--lb-pearl);
  --ip-ink: var(--lb-ink);
  --ip-muted: var(--lb-muted);
  --ip-border: var(--lb-hairline);
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
}
.lb-photo-preview .ip-photo-sheet {
  outline: 1px dashed color-mix(in srgb, var(--lb-trim) 50%, transparent);
  outline-offset: -0.45rem;
  background:
    linear-gradient(135deg, var(--lb-corner) 0 0.42rem, transparent 0.42rem) left top / 0.9rem
      0.9rem no-repeat,
    linear-gradient(225deg, var(--lb-corner) 0 0.42rem, transparent 0.42rem) right top / 0.9rem
      0.9rem no-repeat,
    linear-gradient(45deg, var(--lb-corner) 0 0.42rem, transparent 0.42rem) left bottom / 0.9rem
      0.9rem no-repeat,
    linear-gradient(315deg, var(--lb-corner) 0 0.42rem, transparent 0.42rem) right bottom / 0.9rem
      0.9rem no-repeat,
    var(--lb-pearl);
}
.lb-photo-preview .ip-photo-header,
.lb-photo-preview .ip-photo-controls,
.lb-photo-preview .ip-photo-caption {
  border-color: var(--lb-stitch);
  border-style: dashed;
}
.lb-photo-preview .ip-photo-header p {
  color: var(--lb-label);
  font-family: "Fraunces Variable", Georgia, serif;
  letter-spacing: 0.06em;
}
.lb-photo-preview .ip-photo-viewport {
  margin-inline: clamp(0.6rem, 2cqi, 1rem);
  border: 1px solid var(--lb-hairline);
  background: color-mix(in srgb, var(--lb-blush) 42%, var(--lb-pearl));
}
.lb-photo-preview .ip-photo-caption strong {
  font-family: "Fraunces Variable", Georgia, serif;
  font-weight: 460;
}
.lb-photo-preview .ip-photo-header button,
.lb-photo-preview .ip-photo-controls button {
  background: var(--lb-pearl);
  border-color: color-mix(in srgb, var(--lb-ink) 42%, transparent);
}

/* ------------------------------------------------------------------- gentle note */

/* A pencilled margin note rather than a bulleted list. */
.lb-guidance ul {
  margin: 1.2rem 0 0;
  padding: 0 0 0 1.15rem;
  border-left: 1px dashed var(--lb-stitch);
  list-style: none;
}
.lb-guidance li {
  color: var(--lb-muted);
  font-size: 0.95rem;
}
.lb-guidance li + li {
  margin-top: 0.8rem;
}

/* ------------------------------------------------------------------------- gifts */

/* The gift track itself is declared with the gallery's, above, so the two pages stay identical. */
.lb-gift-grid > article {
  min-width: 0;
  margin: 0;
}
.lb-gift-grid h3 {
  margin-top: 0.7rem;
  font-weight: 430;
}
.lb-gift-grid p { margin-top: 0.35rem; font-size: 0.9rem; }

/* -------------------------------------------------------------------- media, mark */

.lb-media-placeholder {
  display: grid;
  min-height: 8rem;
  padding: 1rem;
  border: 1px dashed var(--lb-stitch);
  background: color-mix(in srgb, var(--lb-pearl) 76%, var(--lb-background));
  color: var(--lb-muted);
  font-size: 0.75rem;
  place-items: center;
  text-align: center;
}
.lb-media-image {
  display: block;
  width: 100%;
  height: auto;
}

/* The keepsake mark: a bound spine with its stitching, closing the book. */
.lb-mark {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.4;
}
.lb-mark .lb-mark-stitch {
  stroke-dasharray: 3 4;
}

.lb-footer {
  display: grid;
  padding: clamp(2.25rem, 7cqi, 3.5rem) var(--lb-gutter) clamp(2.75rem, 8cqi, 4rem);
  border-top: 1px dashed var(--lb-stitch);
  color: var(--lb-muted);
  justify-items: center;
  text-align: center;
}
.lb-footer .lb-mark {
  width: 2.6rem;
  color: color-mix(in srgb, var(--lb-trim) 78%, transparent);
}
.lb-footer p {
  max-width: 26rem;
  margin: 0.9rem 0 0;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: 1rem;
}
/* Platform attribution, set as the book's colophon rather than a badge. */
.lb-footer .iv-powered {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--lb-stitch);
  /* 5.70:1 on the pearl leaf. */
  color: var(--lb-label);
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
}
.lb-footer .iv-powered span {
  /* 5.61:1 on the pearl leaf. */
  color: color-mix(in srgb, var(--lb-rose) 45%, var(--lb-ink));
}

@media (prefers-reduced-motion: reduce) {
  .lb-petals { display: none; }
  .lb-gallery .lb-gallery-grid figure {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
`;
