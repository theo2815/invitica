import type { PublicationArtifact, PublicationSnapshot } from "@invitica/invitation-schema";
import { inviticaIconSvg } from "@invitica/renderer";
import { renderToString } from "react-dom/server.edge";

import { MAP_TILE_KEY_META } from "./map-tile-key";
import { createSnapshotImageResolver, mediaPublicPath } from "./published-media";
import { resolvePublishedRenderer } from "./published-renderer";
import { socialPreviewPublicPath } from "./published-social-preview";

const criticalStyles = `
:root { color-scheme: light; }
html { background: #edf0e8; }
body { min-width: min(20rem, 100%); margin: 0; background: #edf0e8; }
.viewer-unavailable,
.viewer-unavailable * { box-sizing: border-box; }
.viewer-unavailable {
  display: grid;
  min-height: 100svh;
  place-items: center;
  padding: 1.5rem;
  color: #273126;
  font-family: "Instrument Sans Variable", "Segoe UI", sans-serif;
  text-align: center;
}
.viewer-unavailable__paper {
  width: min(100%, 34rem);
  padding: clamp(2.5rem, 9vw, 5rem) clamp(1.5rem, 7vw, 4rem);
  border: 1px solid rgb(89 108 83 / 28%);
  background: #f8f4e9;
  box-shadow: 0 1.5rem 4rem rgb(50 61 48 / 12%);
}
.viewer-unavailable h1 {
  margin: 0;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(2.25rem, 9vw, 4.5rem);
  font-weight: 460;
  letter-spacing: -0.055em;
  line-height: 0.96;
}
.viewer-unavailable p { max-width: 30rem; margin: 1.25rem auto 0; line-height: 1.65; }
.viewer-unavailable a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  margin-top: 1.5rem;
  border-bottom: 1px solid currentColor;
  color: inherit;
  font-size: 0.75rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-decoration: none;
  text-transform: uppercase;
}
.viewer-unavailable a:focus-visible { outline: 3px solid currentColor; outline-offset: 4px; }
`;

// Inlined rather than fetched: a guest page is performance-budgeted for mid-range Philippine
// mobile, and a favicon is not worth a request. Generated from the shared brandmark so it cannot
// drift from the creator app's icon.
const faviconHref = `data:image/svg+xml,${encodeURIComponent(
  inviticaIconSvg({ cornerRatio: 0.1875, glyphRatio: 0.78, size: 64 }),
)}`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function serializeBootstrap(artifact: PublicationArtifact): string {
  return JSON.stringify(artifact)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

type PublicationSnapshotAsset = PublicationSnapshot["assets"][number];

function heroSection(artifact: PublicationArtifact) {
  return artifact.snapshot.document.sections.find((section) => section.type === "hero");
}

function documentTitle(artifact: PublicationArtifact): string {
  const hero = heroSection(artifact);
  return hero ? `${hero.props.title} | Invitica` : "Invitation | Invitica";
}

/**
 * The widest rendition of the hero image, as an absolute URL on the requesting origin.
 * Preview crawlers do not resolve relative paths, and the media route is same-origin.
 */
interface SocialImageMetadata {
  readonly alt: string;
  readonly contentType: string;
  readonly height: number;
  readonly url: string;
  readonly width: number;
}

function socialImageMetadata(
  artifact: PublicationArtifact,
  origin: string,
  title: string,
): SocialImageMetadata | null {
  if (artifact.artifactVersion === 2) {
    return {
      alt: `Invitation for ${title}`,
      contentType: artifact.socialPreview.contentType,
      height: artifact.socialPreview.height,
      url: `${origin}${socialPreviewPublicPath(artifact.socialPreview.sha256)}`,
      width: artifact.socialPreview.width,
    };
  }

  const assetId = heroSection(artifact)?.props.imageAssetId;
  if (!assetId) {
    return null;
  }

  const asset = artifact.snapshot.assets.find(
    (candidate): candidate is Extract<PublicationSnapshotAsset, { kind: "image" }> =>
      candidate.id === assetId && candidate.kind === "image",
  );
  const widest = asset?.renditions.reduce<(typeof asset.renditions)[number] | null>(
    (best, rendition) => (best && best.width >= rendition.width ? best : rendition),
    null,
  );
  return widest
    ? {
        alt: `Invitation for ${title}`,
        contentType: asset?.contentType ?? "image/webp",
        height: widest.height,
        url: `${origin}${mediaPublicPath(widest.sha256, widest.width)}`,
        width: widest.width,
      }
    : null;
}

/**
 * What a messaging app shows when a creator shares the link. Without these tags Messenger
 * renders a bare domain chip, which reads as a suspicious link rather than an invitation.
 * Only what the invitation already states publicly is exposed: the personalized guest token
 * lives in the URL fragment, which is never sent to a server and so never reaches a crawler.
 */
function socialTags(artifact: PublicationArtifact, pageUrl: string): string {
  const hero = heroSection(artifact);
  const title = hero ? hero.props.title : "You are invited";
  const description = [hero?.props.subtitle, hero?.props.dateLabel]
    .filter((value): value is string => Boolean(value))
    .join(" \u00b7 ");
  // Absolute asset and page URLs need the requesting origin, which only the Worker knows.
  const canonical = pageUrl ? new URL(pageUrl) : null;
  const image = canonical ? socialImageMetadata(artifact, canonical.origin, title) : null;

  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Invitica">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    description ? `<meta property="og:description" content="${escapeHtml(description)}">` : null,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical.href)}">` : null,
    image ? `<meta property="og:image" content="${escapeHtml(image.url)}">` : null,
    image ? `<meta property="og:image:secure_url" content="${escapeHtml(image.url)}">` : null,
    image ? `<meta property="og:image:type" content="${escapeHtml(image.contentType)}">` : null,
    image ? `<meta property="og:image:width" content="${image.width}">` : null,
    image ? `<meta property="og:image:height" content="${image.height}">` : null,
    image ? `<meta property="og:image:alt" content="${escapeHtml(image.alt)}">` : null,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    description ? `<meta name="twitter:description" content="${escapeHtml(description)}">` : null,
    image ? `<meta name="twitter:image" content="${escapeHtml(image.url)}">` : null,
    image ? `<meta name="twitter:image:alt" content="${escapeHtml(image.alt)}">` : null,
  ]
    .filter((tag): tag is string => tag !== null)
    .join("\n");
}

function head(title: string, mapTileKey: string, social = ""): string {
  // The MapTiler key is per-deployment configuration, so it is injected here instead of being baked
  // into the immutable snapshot (ADR-006). A meta element carries it without an inline script, which
  // the Viewer's `script-src 'self'` policy forbids.
  const mapTileMeta = mapTileKey
    ? `\n<meta name="${MAP_TILE_KEY_META}" content="${escapeHtml(mapTileKey)}">`
    : "";

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">${mapTileMeta}
<title>${escapeHtml(title)}</title>${social ? `\n${social}` : ""}
<link rel="icon" type="image/svg+xml" href="${faviconHref}">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/viewer.css">
<style>${criticalStyles}</style>`;
}

export function renderPublicationHtml(
  artifact: PublicationArtifact,
  mapTileKey = "",
  pageUrl = "",
): string {
  const Renderer = resolvePublishedRenderer(artifact);
  const resolveImage = createSnapshotImageResolver(artifact.snapshot.assets);
  const invitation = renderToString(
    <Renderer
      document={artifact.snapshot.document}
      mapTileKey={mapTileKey}
      mode="published"
      resolveImage={resolveImage}
    />,
  );

  return `<!doctype html>
<html lang="${artifact.snapshot.document.locale}">
<head>
${head(documentTitle(artifact), mapTileKey, socialTags(artifact, pageUrl))}
</head>
<body>
<div id="viewer-root">${invitation}</div>
<script id="publication-artifact" type="application/json">${serializeBootstrap(artifact)}</script>
<script type="module" src="/viewer.js"></script>
</body>
</html>`;
}

export function renderUnavailableHtml(): string {
  return `<!doctype html>
<html lang="en-PH">
<head>
${head("Invitation unavailable | Invitica", "")}
</head>
<body>
<main class="viewer-unavailable">
  <section class="viewer-unavailable__paper" aria-labelledby="unavailable-heading">
    <h1 id="unavailable-heading">This invitation is unavailable.</h1>
    <p>The link may be incomplete, inactive, or temporarily unavailable. Please check the link or try again.</p>
    <a href="">Try again</a>
  </section>
</main>
</body>
</html>`;
}
