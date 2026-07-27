import type { PublicationArtifact, PublicationSnapshot } from "@invitica/invitation-schema";
import { renderToString } from "react-dom/server.edge";

import { MAP_TILE_KEY_META } from "./map-tile-key";
import { createSnapshotImageResolver, mediaPublicPath } from "./published-media";
import { resolvePublishedRenderer } from "./published-renderer";

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

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>Invitica</title><rect width="64" height="64" rx="12" fill="#f7f3eb"/><g fill="#7a3442" transform="translate(11 4) scale(1.75)"><path d="M3 2h10v8h5c-3.33 1.03-5 3.1-5 6.2v7.63c0 2.25 1.33 3.48 4 3.69V30H3v-2.48c2.67-.21 4-1.44 4-3.69V8.17c0-2.25-1.33-3.48-4-3.69V2Z"/><path d="m15 2 6 6h-6V2Z"/></g></svg>`;
const faviconHref = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;

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
function socialImageUrl(artifact: PublicationArtifact, origin: string): string | null {
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
  return widest ? `${origin}${mediaPublicPath(widest.sha256, widest.width)}` : null;
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
    .join(" · ");
  // Absolute asset and page URLs need the requesting origin, which only the Worker knows.
  const canonical = pageUrl ? new URL(pageUrl) : null;
  const imageUrl = canonical ? socialImageUrl(artifact, canonical.origin) : null;

  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Invitica">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    description ? `<meta property="og:description" content="${escapeHtml(description)}">` : null,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical.href)}">` : null,
    imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : null,
    `<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}">`,
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
