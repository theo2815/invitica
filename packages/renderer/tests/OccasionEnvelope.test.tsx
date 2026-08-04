import { invitationFixture } from "@invitica/invitation-schema/testing";
import { templateRegistry } from "@invitica/template-kit";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  GardenPromiseRenderer,
  GardenPromiseRendererV2,
  GoldenHourRendererV2,
  InvitationRenderer,
  LittleBlessingsRenderer,
  LittleBlessingsRendererV2,
  SundayJoyRendererV2,
} from "../src/index.js";

/**
 * The three occasion families share `RibbonEnvelopeOpening` but not its art direction. These guard
 * the boundary: each family owns a distinct closed object, and no other family inherits any of it.
 */

function documentFor(templateId: string) {
  const manifest = templateRegistry.find((entry) => entry.listing.id === templateId);
  if (!manifest) throw new Error(`Missing template fixture: ${templateId}`);
  return manifest.defaultDocument;
}

/**
 * Renderers inline their stylesheet, so every class name a family *styles* appears in the output
 * whether or not it *renders* it. Assertions about what exists in the scene must read the markup.
 */
function markup(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/g, "");
}

const occasions = [
  { Renderer: GardenPromiseRendererV2, id: "garden-promise" },
  { Renderer: GoldenHourRendererV2, id: "golden-hour" },
  { Renderer: SundayJoyRendererV2, id: "sunday-joy" },
] as const;

describe("occasion envelope", () => {
  it("gives every occasion its own closure and keeps the recipient decorative", () => {
    for (const { Renderer, id } of occasions) {
      const html = renderToStaticMarkup(
        <Renderer document={documentFor(id)} mode="published" recipientName="Tita Remedios" />,
      );

      expect(html).toContain(`data-template="${id}"`);
      expect(markup(html)).toContain("oe-knot");
      // The envelope is hidden from assistive technology, so the opening scene must still carry the
      // name outside it. That is the recipient line, which is never decorative.
      expect(html).toContain("Tita Remedios");
    }
  });

  it("uses a bow for the two paper envelopes and a brass slide for the sleeve", () => {
    const gardenPromise = renderToStaticMarkup(
      <GardenPromiseRendererV2 document={documentFor("garden-promise")} mode="published" />,
    );
    const sundayJoy = renderToStaticMarkup(
      <SundayJoyRendererV2 document={documentFor("sunday-joy")} mode="published" />,
    );
    const goldenHour = renderToStaticMarkup(
      <GoldenHourRendererV2 document={documentFor("golden-hour")} mode="published" />,
    );

    for (const html of [gardenPromise, sundayJoy]) {
      expect(markup(html)).toContain("oe-loop");
      expect(markup(html)).toContain("oe-tail");
    }

    // The deco closure is rectilinear, so it carries the numeral as real type and no bow geometry.
    expect(markup(goldenHour)).toContain("oe-gh-knot");
    expect(markup(goldenHour)).not.toContain("oe-loop");
    expect(markup(goldenHour)).toContain("XVIII");
  });

  it("seals only the family whose flap is sealed", () => {
    const gardenPromise = renderToStaticMarkup(
      <GardenPromiseRendererV2 document={documentFor("garden-promise")} mode="published" />,
    );
    const sundayJoy = renderToStaticMarkup(
      <SundayJoyRendererV2 document={documentFor("sunday-joy")} mode="published" />,
    );

    expect(markup(gardenPromise)).toContain("oe-seal");
    expect(markup(sundayJoy)).not.toContain("oe-seal");
  });

  it("gives Garden Promise layered SVG stationery artwork without leaking it to other families", () => {
    const gardenPromise = renderToStaticMarkup(
      <GardenPromiseRendererV2 document={documentFor("garden-promise")} mode="published" />,
    );
    const goldenHour = renderToStaticMarkup(
      <GoldenHourRendererV2 document={documentFor("golden-hour")} mode="published" />,
    );
    const sundayJoy = renderToStaticMarkup(
      <SundayJoyRendererV2 document={documentFor("sunday-joy")} mode="published" />,
    );

    expect(markup(gardenPromise)).toContain("oe-gp-flap-art");
    expect(markup(gardenPromise)).toContain("oe-gp-pocket-art");
    expect(markup(gardenPromise)).toContain("oe-seal-highlight");

    for (const html of [goldenHour, sundayJoy]) {
      expect(markup(html)).not.toContain("oe-gp-flap-art");
      expect(markup(html)).not.toContain("oe-gp-pocket-art");
      expect(markup(html)).not.toContain("oe-seal-highlight");
    }
  });

  it("gives Golden Hour and Sunday Joy their own layered SVG artwork", () => {
    const goldenHour = renderToStaticMarkup(
      <GoldenHourRendererV2 document={documentFor("golden-hour")} mode="published" />,
    );
    const sundayJoy = renderToStaticMarkup(
      <SundayJoyRendererV2 document={documentFor("sunday-joy")} mode="published" />,
    );

    for (const marker of ["oe-gh-card-art", "oe-gh-sleeve-art", "oe-gh-slide-art"]) {
      expect(markup(goldenHour)).toContain(marker);
      expect(markup(sundayJoy)).not.toContain(marker);
    }

    for (const marker of ["oe-sj-flap-art", "oe-sj-pocket-art", "oe-sj-ribbon-highlight"]) {
      expect(markup(sundayJoy)).toContain(marker);
      expect(markup(goldenHour)).not.toContain(marker);
    }
  });

  it("adds keepsake SVG artwork only to Little Blessings v2", () => {
    const legacy = renderToStaticMarkup(
      <LittleBlessingsRenderer document={documentFor("little-blessings")} mode="published" />,
    );
    const current = renderToStaticMarkup(
      <LittleBlessingsRendererV2 document={documentFor("little-blessings")} mode="published" />,
    );

    for (const marker of ["lb-envelope-cover-art", "lb-envelope-page-art", "lb-keepsake-knot"]) {
      expect(markup(current)).toContain(marker);
      expect(markup(legacy)).not.toContain(marker);
    }
  });

  it("addresses the pocket envelopes and lets the sleeve's card carry the name once", () => {
    const gardenPromise = renderToStaticMarkup(
      <GardenPromiseRendererV2
        document={documentFor("garden-promise")}
        mode="published"
        recipientName="Tita Remedios"
      />,
    );
    const goldenHour = renderToStaticMarkup(
      <GoldenHourRendererV2
        document={documentFor("golden-hour")}
        mode="published"
        recipientName="Tita Remedios"
      />,
    );

    expect(markup(gardenPromise)).toContain("oe-address");
    // Printing the name on the sleeve as well as on the card edge standing above it would set it
    // three times in one scene.
    expect(markup(goldenHour)).not.toContain("oe-address");
  });

  it("offers the skip control the longer sequence requires", () => {
    for (const { Renderer, id } of occasions) {
      const html = renderToStaticMarkup(<Renderer document={documentFor(id)} mode="published" />);

      // The control only mounts while the sequence runs, so server output proves the stylesheet
      // that gives it a 44 px target ships with the family.
      expect(html).toContain(".ot-root .ie-skip-opening");
      expect(html).toContain("min-height: 2.75rem");
    }
  });

  it("clears the flap as the pocket card rises with forward depth", () => {
    const html = renderToStaticMarkup(
      <GardenPromiseRendererV2 document={documentFor("garden-promise")} mode="published" />,
    );

    expect(html).toContain('.ot-root .ie-root[data-opening-state="opening"] .ie-letter {');
    expect(html).toContain("transform: translate3d(0, -46%, 8px);");
    expect(html).toContain(".ot-root .ie-root[data-opening-state='opening'] .ie-envelope-flap {");
    expect(html).toContain("opacity 220ms ease 240ms");
  });

  it("leaves every other family's envelope untouched", () => {
    const others = [
      renderToStaticMarkup(
        <GardenPromiseRenderer document={documentFor("garden-promise")} mode="published" />,
      ),
      renderToStaticMarkup(
        <LittleBlessingsRenderer document={documentFor("little-blessings")} mode="published" />,
      ),
      renderToStaticMarkup(<InvitationRenderer document={invitationFixture} mode="published" />),
    ];

    for (const html of others) {
      // The occasion stylesheet is scoped under .ot-root; none of these renderers emit it at all.
      expect(html).not.toContain(".ot-root .ie-scene");
      expect(html).not.toContain("oe-knot");
      expect(html).not.toContain("oe-address");
      // The shared four-box closure is still what they draw.
      expect(markup(html)).toContain("ie-ribbon-loop");
    }
  });
});
