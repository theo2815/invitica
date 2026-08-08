import { createHash } from "node:crypto";
import { join } from "node:path";

import {
  MAX_PUBLICATION_SOCIAL_PREVIEW_BYTES,
  MAX_RENDITION_BYTES,
  type PublicationSnapshot,
  type PublicationSocialPreview,
  publicationSocialPreviewObjectKey,
  publicationSocialPreviewSchema,
} from "@invitica/invitation-schema";
import sharp from "sharp";

const SOCIAL_WIDTH = 1200;
const SOCIAL_HEIGHT = 630;
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const FRAUNCES_FONT_FILE = join(process.cwd(), "assets", "fonts", "Fraunces.ttf");
const INSTRUMENT_SANS_FONT_FILE = join(process.cwd(), "assets", "fonts", "InstrumentSans.ttf");

export interface PublicationSocialPreviewStore {
  getBinary(key: string, maxBytes: number): Promise<Uint8Array | null>;
  putBinaryIfAbsent(
    key: string,
    body: Uint8Array,
    options: { readonly cacheControl: string; readonly contentType: "image/jpeg" },
  ): Promise<void>;
}

/**
 * Every distinct failure here used to arrive in the log as the same sentence with no cause, so a
 * missing font, an oversized preview, a rendition absent from the bucket, and a sharp crash were
 * indistinguishable. `reason` names the step; `cause` carries whatever was thrown underneath. The
 * creator-facing wording lives in the publication panel, so this string is free to be diagnostic.
 */
export type PublicationSocialPreviewFailure =
  | "hero_rendition_missing_from_manifest"
  | "hero_rendition_object_absent"
  | "preview_exceeds_byte_cap"
  | "preview_composition_failed";

export class PublicationSocialPreviewError extends Error {
  readonly reason: PublicationSocialPreviewFailure;

  constructor(reason: PublicationSocialPreviewFailure, options?: { cause?: unknown }) {
    super(`The publication social preview could not be generated: ${reason}.`, options);
    this.name = "PublicationSocialPreviewError";
    this.reason = reason;
  }
}

function escapeXml(value: string): string {
  const entity = String.fromCharCode(38);
  return value
    .replaceAll(entity, `${entity}amp;`)
    .replaceAll("<", `${entity}lt;`)
    .replaceAll(">", `${entity}gt;`)
    .replaceAll('"', `${entity}quot;`)
    .replaceAll("'", `${entity}apos;`);
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function wrapText(value: string, maxCharacters: number, maxLines: number): string[] {
  const words = normalize(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || current.length === 0) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = `${visible[maxLines - 1]?.slice(0, maxCharacters - 3).trimEnd()}...`;
  return visible;
}

async function textLayer(
  value: string,
  input: {
    readonly baseline: number;
    readonly fill: string;
    readonly fontFamily: string;
    readonly fontFile: string;
    readonly fontSize: number;
    readonly fontWeight: number;
    readonly letterSpacing?: number;
    readonly opacity?: number;
    readonly x: number;
  },
): Promise<{ input: Buffer; left: number; top: number }> {
  const letterSpacing = input.letterSpacing
    ? ` letter_spacing="${input.letterSpacing * 1_024}"`
    : "";
  const opacity = input.opacity === undefined ? "" : ` alpha="${Math.round(input.opacity * 100)}%"`;
  const rendered = await sharp({
    text: {
      dpi: 72,
      font: `${input.fontFamily} ${input.fontSize}`,
      fontfile: input.fontFile,
      rgba: true,
      text: `<span foreground="${escapeXml(input.fill)}" font_weight="${input.fontWeight}"${letterSpacing}${opacity}>${escapeXml(value)}</span>`,
    },
  })
    .png()
    .toBuffer();
  const metadata = await sharp(rendered).metadata();

  return {
    input: rendered,
    left: input.x,
    top: Math.max(0, input.baseline - (metadata.height ?? input.fontSize)),
  };
}

function heroSection(snapshot: PublicationSnapshot) {
  return snapshot.document.sections.find((section) => section.type === "hero");
}

type PublicationSnapshotAsset = PublicationSnapshot["assets"][number];

async function heroImage(
  snapshot: PublicationSnapshot,
  store: PublicationSocialPreviewStore,
): Promise<Uint8Array | null> {
  const assetId = heroSection(snapshot)?.props.imageAssetId;
  if (!assetId) return null;

  const asset = snapshot.assets.find(
    (candidate): candidate is Extract<PublicationSnapshotAsset, { kind: "image" }> =>
      candidate.kind === "image" && candidate.id === assetId,
  );
  const rendition = asset?.renditions.reduce<(typeof asset.renditions)[number] | null>(
    (widest, candidate) => (!widest || candidate.width > widest.width ? candidate : widest),
    null,
  );
  if (!rendition) throw new PublicationSocialPreviewError("hero_rendition_missing_from_manifest");

  const bytes = await store.getBinary(rendition.objectKey, MAX_RENDITION_BYTES);
  // The manifest names this object but the bucket does not hold it, which in practice means the
  // worker and the web app disagree about which bucket stores creator media. The reason alone says
  // that; the key stays out of the error so it cannot reach a log that must not carry identifiers.
  if (!bytes) throw new PublicationSocialPreviewError("hero_rendition_object_absent");
  return bytes;
}

function templateKind(rendererKey: string): "garden" | "storybook" | "standard" {
  if (rendererKey.startsWith("little-blessings-")) return "storybook";
  if (rendererKey.startsWith("garden-promise-")) return "garden";
  return "standard";
}

function cardOverlay(snapshot: PublicationSnapshot, hasPhoto: boolean): Buffer {
  const { surface, accent } = snapshot.document.theme.colors;
  const kind = templateKind(snapshot.rendererKey);
  const photoOnLeft = kind === "storybook";

  const decoration =
    kind === "storybook"
      ? `
        <path d="M28 28h1144v574H28z" fill="none" stroke="${accent}" stroke-opacity=".55" stroke-width="3" stroke-dasharray="3 10"/>
        <path d="M52 52h1096v526H52z" fill="none" stroke="${surface}" stroke-width="2"/>
        <circle cx="1120" cy="88" r="46" fill="${surface}" fill-opacity=".48"/>
        <path d="M1087 88h66M1120 55v66" stroke="${accent}" stroke-opacity=".32" stroke-width="2"/>
      `
      : kind === "garden"
        ? `
          <path d="M25 26h1150v578H25z" fill="none" stroke="${accent}" stroke-opacity=".48" stroke-width="2"/>
          <path d="M66 554c65-94 109-156 188-211M97 500c-4-38 9-66 43-87M142 454c33-5 58 5 77 31M1095 85c-54 35-91 78-120 137M1059 113c-34 0-57 14-70 43M1026 160c10 30 29 49 57 58" fill="none" stroke="${accent}" stroke-linecap="round" stroke-width="5" opacity=".44"/>
          <circle cx="141" cy="420" r="10" fill="${accent}" opacity=".34"/>
          <circle cx="1001" cy="154" r="9" fill="${accent}" opacity=".34"/>
        `
        : `<path d="M32 32h1136v566H32z" fill="none" stroke="${accent}" stroke-opacity=".5" stroke-width="3"/>`;

  const photoFrame = hasPhoto
    ? photoOnLeft
      ? `
        <rect x="60" y="58" width="520" height="514" rx="5" fill="none" stroke="${accent}" stroke-opacity=".35" stroke-width="2"/>
        <path d="M68 98h42V66M530 66v32h42M68 532h42v32M530 564v-32h42" fill="none" stroke="${accent}" stroke-width="5" opacity=".55"/>
      `
      : `
        <rect x="660" y="62" width="474" height="506" fill="none" stroke="${accent}" stroke-opacity=".44" stroke-width="3"/>
        <path d="M686 88h422v454H686z" fill="none" stroke="${accent}" stroke-opacity=".25" stroke-width="2"/>
      `
    : `<rect x="88" y="76" width="1024" height="478" rx="4" fill="${surface}" fill-opacity=".42" stroke="${accent}" stroke-opacity=".3"/>`;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_WIDTH}" height="${SOCIAL_HEIGHT}">
    ${decoration}
    ${photoFrame}
  </svg>`);
}

async function cardTextLayers(snapshot: PublicationSnapshot, hasPhoto: boolean) {
  const hero = heroSection(snapshot);
  const title = hero?.props.title ?? "You are invited";
  const subtitle = hero?.props.subtitle ?? "A celebration shared with the people we love";
  const date = hero?.props.dateLabel ?? "";
  const { text, accent } = snapshot.document.theme.colors;
  const kind = templateKind(snapshot.rendererKey);
  const photoOnLeft = kind === "storybook";
  const textX = hasPhoto ? (photoOnLeft ? 650 : 92) : 126;
  const titleLines = wrapText(title, hasPhoto ? 21 : 30, 2);
  const subtitleLines = wrapText(subtitle, hasPhoto ? 39 : 54, 2);
  const titleY = hasPhoto ? 238 : 246;
  const titleLineHeight = hasPhoto ? 76 : 86;
  const subtitleY = titleY + titleLines.length * 78 + 22;
  const eventLabel =
    kind === "storybook"
      ? "CHRISTENING INVITATION"
      : kind === "garden"
        ? "WEDDING INVITATION"
        : "YOU ARE INVITED";

  return Promise.all([
    textLayer(eventLabel, {
      baseline: hasPhoto ? 150 : 154,
      fill: accent,
      fontFamily: "Instrument Sans",
      fontFile: INSTRUMENT_SANS_FONT_FILE,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: 5,
      x: textX,
    }),
    ...titleLines.map((line, index) =>
      textLayer(line, {
        baseline: titleY + index * titleLineHeight,
        fill: text,
        fontFamily: "Fraunces",
        fontFile: FRAUNCES_FONT_FILE,
        fontSize: hasPhoto ? 66 : 76,
        fontWeight: 600,
        x: textX,
      }),
    ),
    ...subtitleLines.map((line, index) =>
      textLayer(line, {
        baseline: subtitleY + index * 36,
        fill: text,
        fontFamily: "Instrument Sans",
        fontFile: INSTRUMENT_SANS_FONT_FILE,
        fontSize: 25,
        fontWeight: 400,
        x: textX,
      }),
    ),
    ...(normalize(date)
      ? [
          textLayer(date, {
            baseline: hasPhoto ? 518 : 520,
            fill: accent,
            fontFamily: "Instrument Sans",
            fontFile: INSTRUMENT_SANS_FONT_FILE,
            fontSize: 23,
            fontWeight: 700,
            x: textX,
          }),
        ]
      : []),
    textLayer("INVITICA", {
      baseline: 560,
      fill: text,
      fontFamily: "Instrument Sans",
      fontFile: INSTRUMENT_SANS_FONT_FILE,
      fontSize: 18,
      fontWeight: 700,
      letterSpacing: 4,
      opacity: 0.72,
      x: textX,
    }),
  ]);
}

export async function createPublicationSocialPreview(
  snapshot: PublicationSnapshot,
  store: PublicationSocialPreviewStore,
): Promise<PublicationSocialPreview> {
  try {
    const source = await heroImage(snapshot, store);
    const photoOnLeft = templateKind(snapshot.rendererKey) === "storybook";
    const photo = source
      ? await sharp(source)
          .resize({
            background: snapshot.document.theme.colors.surface,
            fit: "contain",
            height: photoOnLeft ? 474 : 454,
            width: photoOnLeft ? 480 : 422,
          })
          .jpeg({ quality: 88 })
          .toBuffer()
      : null;
    const overlay = cardOverlay(snapshot, Boolean(photo));
    const textLayers = await cardTextLayers(snapshot, Boolean(photo));
    const output = await sharp({
      create: {
        background: snapshot.document.theme.colors.background,
        channels: 4,
        height: SOCIAL_HEIGHT,
        width: SOCIAL_WIDTH,
      },
    })
      .composite([
        ...(photo
          ? [
              {
                input: photo,
                left: photoOnLeft ? 80 : 686,
                top: photoOnLeft ? 78 : 88,
              },
            ]
          : []),
        { input: overlay, left: 0, top: 0 },
        ...textLayers,
      ])
      .jpeg({ chromaSubsampling: "4:4:4", mozjpeg: true, quality: 88 })
      .toBuffer();

    if (output.byteLength > MAX_PUBLICATION_SOCIAL_PREVIEW_BYTES) {
      throw new PublicationSocialPreviewError("preview_exceeds_byte_cap", {
        cause: new Error(
          `Preview was ${output.byteLength} bytes against a ${MAX_PUBLICATION_SOCIAL_PREVIEW_BYTES} byte cap`,
        ),
      });
    }

    const sha256 = createHash("sha256").update(output).digest("hex");
    const objectKey = publicationSocialPreviewObjectKey(sha256);
    await store.putBinaryIfAbsent(objectKey, output, {
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      contentType: "image/jpeg",
    });

    return publicationSocialPreviewSchema.parse({
      byteLength: output.byteLength,
      contentType: "image/jpeg",
      height: SOCIAL_HEIGHT,
      objectKey,
      sha256,
      width: SOCIAL_WIDTH,
    });
  } catch (error) {
    if (error instanceof PublicationSocialPreviewError) throw error;
    // Font file, sharp, and R2 write failures all land here. Keeping the cause is the difference
    // between a one-line log and a debugging session.
    throw new PublicationSocialPreviewError("preview_composition_failed", { cause: error });
  }
}
