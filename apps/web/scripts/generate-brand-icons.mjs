/**
 * Renders every committed Invitica icon from the single glyph in `@invitica/renderer`.
 *
 * Run with `pnpm --filter @invitica/web brand:icons` after changing the mark or its colours, then
 * commit the outputs. The rasters are committed rather than generated during `next build` because
 * `favicon.ico` cannot be produced by Next's `ImageResponse` convention at all, and because a mark
 * that changes roughly never should not cost every build a `sharp` pass.
 *
 * Sizes and shapes are not interchangeable:
 *  - Anything a platform masks itself (Apple touch icon, `purpose: "maskable"`) is authored
 *    full-bleed and square. Pre-rounding a source the OS also rounds shows a double-rounded edge.
 *  - Maskable art must survive Android's safe circle of radius 40% of the side. At a 0.56 ink
 *    height the glyph's furthest corner sits at radius ~0.333, inside that circle. The 0.78 ratio
 *    used for browser icons does not — its corners land at ~0.455 and would be clipped.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { inviticaIconSvg } from "../../../packages/renderer/src/brand.ts";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..", "..");

/** Corner radius of the browser icon, as a fraction of the side. */
const BROWSER_CORNER_RATIO = 0.1875;
/** Ink height for the favicon lineage, where filling the box buys legibility at 16 px. */
const BROWSER_GLYPH_RATIO = 0.78;
/** Ink height for `purpose: "any"` manifest icons, which are shown large and want breathing room. */
const MANIFEST_GLYPH_RATIO = 0.66;
/** Ink height for icons a platform masks. Keeps every corner inside Android's 40% safe circle. */
const MASKED_GLYPH_RATIO = 0.56;
/** Ink height for the Apple touch icon: masked, but sized to sit evenly beside native app icons. */
const APPLE_GLYPH_RATIO = 0.6;

/** Rasterize at 4x and downsample, which reads better at 16 px than a direct vector render. */
async function renderPng(size, glyphRatio, cornerRatio) {
  const supersample = size * 4;
  const svg = inviticaIconSvg({ cornerRatio, glyphRatio, size: supersample });
  return await sharp(Buffer.from(svg))
    .resize(size, size, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Packs PNG buffers into an ICO container. Embedded-PNG ICOs have been read by every relevant
 * browser for well over a decade, so this stays a few lines of local code rather than a dependency.
 */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ data, size }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function write(relativePath, contents) {
  const target = join(repoRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
  console.log(`  ${relativePath} (${contents.length.toLocaleString()} bytes)`);
}

async function main() {
  console.log("Generating Invitica brand icons…");

  // Browser tab: scalable, authored rounded because nothing masks a favicon.
  await write(
    "apps/web/app/icon.svg",
    `${inviticaIconSvg({
      cornerRatio: BROWSER_CORNER_RATIO,
      glyphRatio: BROWSER_GLYPH_RATIO,
      size: 64,
    })}\n`,
  );

  // Raster fallback for every client that cannot read an SVG favicon — which includes all of
  // Safari and iOS Safari before Safari 26.
  const icoSizes = [16, 32, 48];
  const icoImages = await Promise.all(
    icoSizes.map(async (size) => ({
      data: await renderPng(size, BROWSER_GLYPH_RATIO, BROWSER_CORNER_RATIO),
      size,
    })),
  );
  await write("apps/web/app/favicon.ico", packIco(icoImages));

  // iOS Home Screen. Opaque and square: iOS renders an alpha channel as black and applies its own
  // corner mask.
  const appleIcon = await sharp(await renderPng(180, APPLE_GLYPH_RATIO, 0))
    .flatten({ background: "#7a3442" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await write("apps/web/app/apple-icon.png", appleIcon);

  // The same bytes at the conventional root path, in both deployables. A guest invitation links
  // `/apple-touch-icon.png`, and that page is reachable on two origins: `invitica.app/i/*`, where
  // Next serves the file, and the Worker's own `workers.dev` origin, where its asset directory
  // does. Only one of the two would resolve if this were shipped once.
  await write("apps/web/public/apple-touch-icon.png", appleIcon);
  await write("apps/viewer/static/apple-touch-icon.png", appleIcon);

  // Web app manifest icons. Chrome's install criteria require 192 and 512; the maskable pair is
  // what stops Android letterboxing the icon inside a white badge.
  for (const size of [192, 512]) {
    await write(
      `apps/web/public/icons/icon-${size}.png`,
      await renderPng(size, MANIFEST_GLYPH_RATIO, BROWSER_CORNER_RATIO),
    );
    await write(
      `apps/web/public/icons/maskable-${size}.png`,
      await renderPng(size, MASKED_GLYPH_RATIO, 0),
    );
  }

  console.log("Done.");
}

await main();
