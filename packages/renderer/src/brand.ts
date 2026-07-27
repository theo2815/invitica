/**
 * The Invitica brandmark, in one place.
 *
 * The glyph is a serif "I" whose upper-right counter folds back like the corner of a page — the
 * reduction of `Logo/concept-d-folded-wordmark.png` down to something legible at 16 px. It was
 * previously hand-copied into three files (the creator `BrandMark`, `apps/web/app/icon.svg`, and the
 * Viewer's inline favicon), which is why this module exists: an icon that disagrees with itself
 * across surfaces is the branding defect, not a styling preference.
 *
 * Lives in `@invitica/renderer` because that package already owns the shared Invitica attribution
 * (`PoweredByInvitica`) and is the one package both deployables depend on.
 */

/** Coordinate space the glyph paths are authored in. */
export const INVITICA_GLYPH_VIEW_BOX = "0 0 24 32";

/**
 * The two subpaths of the mark: the serif stem, then the folded corner. Rendered with a single
 * fill; they are separate paths only because the fold is a distinct shape.
 */
export const INVITICA_GLYPH_PATHS = [
  "M3 2h10v8h5c-3.33 1.03-5 3.1-5 6.2v7.63c0 2.25 1.33 3.48 4 3.69V30H3v-2.48c2.67-.21 4-1.44 4-3.69V8.17c0-2.25-1.33-3.48-4-3.69V2Z",
  "m15 2 6 6h-6V2Z",
] as const;

/**
 * Tight ink bounds of the paths above, within {@link INVITICA_GLYPH_VIEW_BOX}. The authored view box
 * carries slack on every side, so centring on it would leave the mark visibly high and small. Every
 * generated icon centres on these numbers instead.
 */
export const INVITICA_GLYPH_INK = { height: 28, width: 18, x: 3, y: 2 } as const;

/**
 * Brand colours, matching the `--accent` and `--background` tokens the creator app already uses.
 *
 * The mark sits cream-on-wine rather than wine-on-cream for icons specifically: a cream field
 * vanishes into light browser chrome at tab size and into light home-screen wallpapers, which is
 * how an icon that is technically present still reads as missing.
 */
export const INVITICA_BRAND_FIELD = "#7a3442";
export const INVITICA_BRAND_GLYPH = "#f7f3eb";

export interface InviticaIconOptions {
  /**
   * Corner radius as a fraction of the side. Use `0` for anything the platform masks itself —
   * an Apple touch icon or a `purpose: "maskable"` manifest icon — because pre-rounding a source
   * the OS also rounds produces a visible double-rounded edge.
   */
  readonly cornerRatio?: number;
  /** Ink height as a fraction of the side. */
  readonly glyphRatio: number;
  /** Side length of the square canvas, in user units. */
  readonly size: number;
}

/**
 * A complete square icon as an SVG string: filled field, glyph centred on its ink bounds.
 *
 * Kept as a string rather than a React element because every consumer needs it as bytes — the
 * raster generator hands it to `sharp`, and the Viewer inlines it as a `data:` URI to avoid
 * spending a request on a favicon inside a mobile performance budget.
 */
export function inviticaIconSvg({
  cornerRatio = 0,
  glyphRatio,
  size,
}: InviticaIconOptions): string {
  const scale = (size * glyphRatio) / INVITICA_GLYPH_INK.height;
  const offsetX = (size - INVITICA_GLYPH_INK.width * scale) / 2 - INVITICA_GLYPH_INK.x * scale;
  const offsetY = (size - INVITICA_GLYPH_INK.height * scale) / 2 - INVITICA_GLYPH_INK.y * scale;
  const radius = size * cornerRatio;

  const field =
    radius > 0
      ? `<rect width="${size}" height="${size}" rx="${round(radius)}" fill="${INVITICA_BRAND_FIELD}"/>`
      : `<rect width="${size}" height="${size}" fill="${INVITICA_BRAND_FIELD}"/>`;
  const paths = INVITICA_GLYPH_PATHS.map((path) => `<path d="${path}"/>`).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<title>Invitica</title>${field}` +
    `<g fill="${INVITICA_BRAND_GLYPH}" transform="translate(${round(offsetX)} ${round(offsetY)}) scale(${round(scale)})">${paths}</g>` +
    `</svg>`
  );
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
