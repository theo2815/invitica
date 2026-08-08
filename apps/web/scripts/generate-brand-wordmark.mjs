/**
 * Renders the dark-theme header wordmark from the approved light master.
 *
 * Run with `pnpm --filter @invitica/web brand:wordmark` after changing the master or either theme's
 * ink, then commit the output. Committed rather than generated during `next build` for the reason
 * `generate-brand-icons.mjs` already gives: a mark that changes roughly never should not cost every
 * build a `sharp` pass.
 *
 * The compact `BrandMark` variant needs none of this — it is the repository-owned SVG glyph and
 * already paints in `currentColor`. Only the full lockup is a raster, and a raster cannot follow a
 * theme, which is why a creator in dark mode was reading near-black `nvitica` on a near-black page.
 *
 * **Why a projection rather than two colour swaps.** The master is two flat inks, but every edge
 * between them and the transparent background is anti-aliased, and the source carries enough
 * compression noise that a hue test misfiles those edge pixels — `rgb(107 76 50)` and
 * `rgb(38 47 35)` both occur. So each pixel is projected onto the line joining the two light inks,
 * and its position on that line picks the same blend of the two dark inks. Alpha is copied
 * untouched, so the letterforms keep the master's exact coverage and the mark is the same shape in
 * both themes rather than a re-drawing of it.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..", "..");

const MASTER = join(repoRoot, "Logo", "invitica-header-wordmark.png");
const OUTPUT = join(webRoot, "public", "brand", "invitica-wordmark-v2-dark.png");

/** The two inks the master is drawn in: the `nvitica` letterforms, and the folded I with its dot. */
const LIGHT_INK = [41, 34, 33];
const LIGHT_WINE = [122, 52, 66];

/** Their dark-theme counterparts — `--text` and `--accent` from `globals.css`. */
const DARK_INK = [243, 236, 226];
const DARK_WINE = [231, 154, 168];

const axis = LIGHT_WINE.map((c, i) => c - LIGHT_INK[i]);
const axisLengthSquared = axis.reduce((sum, c) => sum + c * c, 0);

const { data, info } = await sharp(MASTER)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += info.channels) {
  if (data[i + 3] === 0) continue;

  // Where this pixel sits between the two inks, clamped so noise outside the segment lands on the
  // nearer end rather than overshooting into a colour neither ink contains.
  const offset = [data[i] - LIGHT_INK[0], data[i + 1] - LIGHT_INK[1], data[i + 2] - LIGHT_INK[2]];
  const position = Math.min(
    1,
    Math.max(0, offset.reduce((sum, c, n) => sum + c * axis[n], 0) / axisLengthSquared),
  );

  for (let channel = 0; channel < 3; channel += 1) {
    data[i + channel] = Math.round(
      DARK_INK[channel] + position * (DARK_WINE[channel] - DARK_INK[channel]),
    );
  }
}

const png = await sharp(data, {
  raw: { channels: info.channels, height: info.height, width: info.width },
})
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(OUTPUT, png);

console.log(`wrote ${OUTPUT} (${info.width}x${info.height}, ${png.length} bytes)`);
