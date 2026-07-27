import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  INVITICA_BRAND_FIELD,
  INVITICA_BRAND_GLYPH,
  INVITICA_GLYPH_INK,
  inviticaIconSvg,
} from "@invitica/renderer";
import { describe, expect, it } from "vitest";

import manifest from "../app/manifest";

const appRoot = resolve(__dirname, "../app");
const publicRoot = resolve(__dirname, "../public");

/** PNG dimensions from the IHDR chunk, which is always the first chunk. */
function pngSize(path: string): { height: number; width: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
}

describe("browser tab icons", () => {
  // Safari and iOS Safari did not read an SVG favicon before Safari 26, and the app shipped no
  // raster fallback at all — which is why the mark was simply absent in the tab on older iPhones.
  it("ships a raster fallback beside the scalable icon", () => {
    expect(existsSync(resolve(appRoot, "icon.svg"))).toBe(true);

    const ico = readFileSync(resolve(appRoot, "favicon.ico"));
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(3); // 16, 32, 48
    expect([...new Set([0, 1, 2].map((i) => ico.readUInt8(6 + i * 16)))].sort()).toEqual([
      16, 32, 48,
    ]);
  });

  it("draws the tab icon cream-on-wine so it stays visible against light browser chrome", () => {
    const svg = readFileSync(resolve(appRoot, "icon.svg"), "utf8");

    expect(svg).toContain(`fill="${INVITICA_BRAND_FIELD}"`);
    expect(svg).toContain(`fill="${INVITICA_BRAND_GLYPH}"`);
  });
});

describe("Apple touch icon", () => {
  // iOS picks the Home Screen icon from `apple-touch-icon`; with none present it renders a
  // screenshot of the page instead, which is what the founder reported.
  it("is a 180px square in both places a page can link it from", () => {
    for (const path of [
      resolve(appRoot, "apple-icon.png"),
      resolve(publicRoot, "apple-touch-icon.png"),
      resolve(__dirname, "../../viewer/static/apple-touch-icon.png"),
    ]) {
      expect(pngSize(path)).toEqual({ height: 180, width: 180 });
    }
  });

  // iOS composites an alpha channel against black and applies its own corner mask, so a
  // transparent or pre-rounded source shows a dark fringe on the Home Screen.
  it("is fully opaque", () => {
    const bytes = readFileSync(resolve(appRoot, "apple-icon.png"));
    // IHDR colour type at byte 25: 2 is truecolour, 6 would carry an alpha channel.
    expect(bytes.readUInt8(25)).toBe(2);
  });
});

describe("web app manifest", () => {
  const built = manifest();

  // Chrome will not treat the site as installable without these, and "Add to Home Screen" then
  // degrades to a bookmark shortcut with a synthesized icon.
  it("meets Chrome's installability criteria", () => {
    expect(built.name).toBeTruthy();
    expect(built.short_name).toBeTruthy();
    expect(built.start_url).toBeTruthy();
    expect(built.display).toBe("standalone");

    const sizes = (built.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  // Without a maskable icon Android composites the icon inside a white badge instead of filling
  // the launcher's adaptive shape.
  it("offers a maskable icon at both required sizes", () => {
    const maskable = (built.icons ?? []).filter((icon) => icon.purpose === "maskable");

    expect(maskable.map((icon) => icon.sizes).sort()).toEqual(["192x192", "512x512"]);
  });

  it("points every declared icon at a file that exists at the declared size", () => {
    for (const icon of built.icons ?? []) {
      const [width, height] = String(icon.sizes).split("x").map(Number);
      expect(pngSize(resolve(publicRoot, String(icon.src).replace(/^\//, "")))).toEqual({
        height,
        width,
      });
    }
  });

  it("carries the brand colours the rest of the app uses", () => {
    expect(built.theme_color).toBe(INVITICA_BRAND_FIELD);
    expect(built.background_color).toBe(INVITICA_BRAND_GLYPH);
  });
});

describe("maskable safe zone", () => {
  // Android may clip a maskable icon to a circle of radius 40% of the side. The glyph's furthest
  // ink corner has to stay inside that circle, or the mark loses its serifs on some launchers.
  it("keeps the whole glyph inside Android's safe circle at the ratio the generator uses", () => {
    const maskedGlyphRatio = 0.56;
    const halfHeight = maskedGlyphRatio / 2;
    const halfWidth = (INVITICA_GLYPH_INK.width / INVITICA_GLYPH_INK.height) * halfHeight;
    const cornerRadius = Math.hypot(halfHeight, halfWidth);

    expect(cornerRadius).toBeLessThan(0.4);
  });

  it("centres the glyph on its ink bounds rather than its slack view box", () => {
    const svg = inviticaIconSvg({ glyphRatio: 0.5, size: 100 });
    const [, offsetX, offsetY] = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(svg) ?? [];
    const [, scale] = /scale\(([\d.]+)\)/.exec(svg) ?? [];

    // Ink centre lands on the canvas centre in both axes.
    const inkCentreX =
      Number(offsetX) + (INVITICA_GLYPH_INK.x + INVITICA_GLYPH_INK.width / 2) * Number(scale);
    const inkCentreY =
      Number(offsetY) + (INVITICA_GLYPH_INK.y + INVITICA_GLYPH_INK.height / 2) * Number(scale);

    expect(inkCentreX).toBeCloseTo(50, 1);
    expect(inkCentreY).toBeCloseTo(50, 1);
  });
});
