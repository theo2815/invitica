import { resolveTemplateById } from "@invitica/template-kit";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GardenPromiseRendererV2, SundayJoyRendererV2 } from "../src/index.js";

/**
 * Guards the small-text colors the occasion templates paint on their own palettes. The browser
 * accessibility lane cannot cover these: its preview route renders published general output, so the
 * RSVP deadline never appears, the gallery and gifts sections ship hidden, no starter schedule item
 * carries a description, and the media placeholders only exist when an upload is missing.
 */

const AA_NORMAL_TEXT = 4.5;

interface Rgb {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

function parseHex(value: string): Rgb {
  return {
    blue: Number.parseInt(value.slice(5, 7), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    red: Number.parseInt(value.slice(1, 3), 16),
  };
}

function relativeLuminance({ blue, green, red }: Rgb): number {
  const channel = (value: number) => {
    const ratio = value / 255;
    return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Mirrors `color-mix(in srgb, <source> <percentage>, <target>)`. */
function colorMix(source: Rgb, target: Rgb, sourceShare: number): Rgb {
  const blend = (from: number, to: number) => from * sourceShare + to * (1 - sourceShare);
  return {
    blue: blend(source.blue, target.blue),
    green: blend(source.green, target.green),
    red: blend(source.red, target.red),
  };
}

/**
 * The three families that share `OccasionTemplateRenderer` and therefore `--ie-ribbon-text`.
 * Little Blessings ships its own renderer and already derives a dark `--lb-label` from its trim and
 * ink, so it neither reads nor needs this token.
 */
const occasionTemplateIds = ["garden-promise", "golden-hour", "sunday-joy"] as const;

function palette(templateId: string) {
  const { colors } = resolveTemplateById(templateId).defaultDocument.theme;
  return {
    accent: parseHex(colors.accent),
    background: parseHex(colors.background),
    ink: parseHex(colors.text),
    surface: parseHex(colors.surface),
  };
}

describe("occasion template text contrast", () => {
  it.each(
    occasionTemplateIds,
  )("keeps the derived accent readable as small text on %s", (templateId) => {
    const { accent, background, ink, surface } = palette(templateId);
    // --ie-ribbon-text: color-mix(in srgb, var(--ie-ribbon) 70%, var(--ie-ink))
    const ribbonText = colorMix(accent, ink, 0.7);

    expect(contrastRatio(ribbonText, surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(ribbonText, background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(occasionTemplateIds)("keeps every muted ink tier readable on %s", (templateId) => {
    const { background, ink, surface } = palette(templateId);

    // Tiers used by occasionTemplateStyles on the paper column.
    for (const share of [0.74, 0.76, 0.78]) {
      expect(contrastRatio(colorMix(ink, surface, share), surface)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }

    // Tier used by ribbonEnvelopeStyles on the opening scene, which sits on the page background.
    expect(contrastRatio(colorMix(ink, background, 0.76), background)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  it("keeps the Garden Promise RSVP deadline readable on its tinted band", () => {
    const { accent, ink, surface } = palette("garden-promise");
    // .ot-rsvp background: color-mix(in srgb, var(--ie-ribbon) 13%, var(--ie-paper))
    const band = colorMix(accent, surface, 0.13);

    expect(contrastRatio(colorMix(accent, ink, 0.7), band)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(accent, band)).toBeLessThan(AA_NORMAL_TEXT);
  });
});

describe("Garden Promise v2 stylesheet", () => {
  const html = renderToStaticMarkup(
    <GardenPromiseRendererV2
      document={resolveTemplateById("garden-promise").defaultDocument}
      mode="preview"
    />,
  );

  it("paints small text with the derived accent instead of the raw ribbon", () => {
    expect(html).toContain(
      "--ie-ribbon-text: color-mix(in srgb, var(--ie-ribbon) 70%, var(--ie-ink))",
    );
    expect(html).toContain("color: var(--ie-ribbon-text)");
    expect(html).not.toContain("color-mix(in srgb, var(--ie-ink) 66%, transparent)");
    expect(html).not.toContain("color-mix(in srgb, var(--ie-ink) 68%, transparent)");
    expect(html).not.toContain("color-mix(in srgb, var(--ie-ink) 70%, transparent)");
  });

  it("holds the countdown digits on a fixed advance width", () => {
    expect(html).toContain("font-variant-numeric: tabular-nums");
  });

  it("gates the stored section presets behind reduced motion and view-timeline support", () => {
    expect(html).toContain("@supports (animation-timeline: view())");
    expect(html).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(html).toContain("animation-range: cover 0% cover 20%");
  });

  it("draws the specimen as one inline sprig kept out of the accessibility tree", () => {
    // Both the hero mount and the closed-envelope cover carry the sprig, and the sprig itself is
    // hidden rather than relying only on its wrapper.
    expect(html).toContain(
      'class="ot-motif" data-context="hero" data-motif="garden-promise"><svg aria-hidden="true" class="ot-sprig"',
    );
    expect(html).toContain(
      'class="ot-motif" data-context="cover" data-motif="garden-promise"><svg aria-hidden="true" class="ot-sprig"',
    );
    expect(html).not.toContain(
      'class="ot-motif" data-context="hero" data-motif="garden-promise"><i>',
    );
  });

  it("leaves the other occasion motifs on their existing elements", () => {
    const sundayJoy = renderToStaticMarkup(
      <SundayJoyRendererV2
        document={resolveTemplateById("sunday-joy").defaultDocument}
        mode="preview"
      />,
    );

    // The shared stylesheet always carries the .ot-sprig rules, so assert on the rendered element.
    expect(sundayJoy).not.toContain('class="ot-sprig"');
    expect(sundayJoy).toContain('class="ot-motif" data-context="hero" data-motif="sunday-joy"><i>');
  });

  it("separates its typography from the shared occasion face", () => {
    expect(html).toContain('font-variation-settings: "WONK" 1');
    // The entourage labels stay on the sans face, so they must opt back out.
    expect(html).toContain("font-variation-settings: normal");
  });

  it("sets the entourage as a two-column roll that never splits a group", () => {
    expect(html).toContain("columns: 2");
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("columns: 1");
  });

  it("settles the specimen once the envelope clears, on a decorative element only", () => {
    // Keyed on the opened state so it plays as the signature moment rather than on page load, and
    // scoped to the hero sprig — never text, so it cannot affect contrast at any frame.
    expect(html).toContain('.ie-root[data-motion-enabled="true"][data-opening-state="opened"]');
    expect(html).toContain("animation: ot-sprig-settle 720ms");
    expect(html).toContain("@keyframes ot-sprig-settle");

    const settle = html.slice(html.indexOf("@keyframes ot-sprig-settle"));
    expect(settle).toContain("transform: none");
    expect(settle.slice(0, settle.indexOf("}\n}"))).not.toContain("opacity");
  });

  it("reveals sections by transform alone so text never animates below AA contrast", () => {
    const reveals = [...html.matchAll(/@keyframes ot-[a-z]+ \{[^}]*\}[^}]*\}/g)].map(
      (match) => match[0],
    );

    expect(reveals).toHaveLength(2);
    expect(reveals.join("\n")).toContain("transform: translateY(1.25rem)");
    expect(reveals.join("\n")).toContain("transform: scale(0.975)");
    for (const frames of reveals) expect(frames).not.toContain("opacity");
  });
});
