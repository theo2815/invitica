import type { PublicationArtifact } from "@invitica/invitation-schema";
import { renderToString } from "react-dom/server.edge";

import { MAP_TILE_KEY_META } from "./map-tile-key";
import { createSnapshotImageResolver } from "./published-media";
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

function documentTitle(artifact: PublicationArtifact): string {
  const hero = artifact.snapshot.document.sections.find((section) => section.type === "hero");
  return hero ? `${hero.props.title} | Invitica` : "Invitation | Invitica";
}

function head(title: string, mapTileKey: string): string {
  // The MapTiler key is per-deployment configuration, so it is injected here instead of being baked
  // into the immutable snapshot (ADR-006). A meta element carries it without an inline script, which
  // the Viewer's `script-src 'self'` policy forbids.
  const mapTileMeta = mapTileKey
    ? `\n<meta name="${MAP_TILE_KEY_META}" content="${escapeHtml(mapTileKey)}">`
    : "";

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">${mapTileMeta}
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/viewer.css">
<style>${criticalStyles}</style>`;
}

export function renderPublicationHtml(artifact: PublicationArtifact, mapTileKey = ""): string {
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
${head(documentTitle(artifact), mapTileKey)}
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
