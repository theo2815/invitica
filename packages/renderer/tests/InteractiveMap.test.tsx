import { templateRegistry } from "@invitica/template-kit";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildMapTileUrl, LittleBlessingsRenderer } from "../src/index.js";

const TILE_KEY = "test-map-key/with+symbols";

function littleBlessingsDocument() {
  const manifest = templateRegistry.find((entry) => entry.listing.id === "little-blessings");

  if (!manifest) {
    throw new Error("Little Blessings fixture is required");
  }

  return manifest.defaultDocument;
}

describe("buildMapTileUrl", () => {
  it("keeps Leaflet's tile placeholders and escapes the key", () => {
    const url = buildMapTileUrl(TILE_KEY);

    expect(url).toContain("https://api.maptiler.com/maps/");
    expect(url).toContain("/{z}/{x}/{y}{r}.png?key=");
    expect(url).toContain("key=test-map-key%2Fwith%2Bsymbols");
  });
});

describe("Little Blessings venue map", () => {
  it("serves the directions fallback and no map key in server-rendered output", () => {
    const html = renderToStaticMarkup(
      <LittleBlessingsRenderer
        document={littleBlessingsDocument()}
        mapTileKey={TILE_KEY}
        mode="published"
      />,
    );

    // The control is client-only, so guests without JavaScript never see an inert button, and the
    // key stays out of the HTML the Viewer serves and caches.
    expect(html).toContain("Get directions");
    expect(html).not.toContain("Show map");
    expect(html).not.toContain("api.maptiler.com");
    expect(html).not.toContain(TILE_KEY);
  });

  it("still renders the venue card when no map key is configured", () => {
    const html = renderToStaticMarkup(
      <LittleBlessingsRenderer document={littleBlessingsDocument()} mode="published" />,
    );

    expect(html).toContain("Get directions");
    expect(html).not.toContain("Show map");
  });
});
