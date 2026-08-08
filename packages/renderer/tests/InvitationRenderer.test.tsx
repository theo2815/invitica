import { parsePublicationSnapshot } from "@invitica/invitation-schema";
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
  resolveTemplateRenderer,
  resolveTemplateRendererRegistration,
  SundayJoyRendererV2,
  UnknownTemplateRendererError,
} from "../src/index.js";
import { loadTemplateRendererRegistration } from "../src/lazy-registry.js";

describe("InvitationRenderer", () => {
  it("renders the same document contract for a published personalized invitation", () => {
    const html = renderToStaticMarkup(
      <InvitationRenderer
        document={invitationFixture}
        mode="published"
        recipientName="Uncle John"
      />,
    );

    expect(html).toContain("Preparing invitation for Uncle John");
    expect(html).toContain('data-envelope-hydrated="false"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Theo &amp; Maria");
    expect(html).toContain("The Glass Garden");
    expect(html).toContain('data-render-mode="published"');
  });

  it("removes hidden sections and disables motion when requested", () => {
    const hiddenVenueDocument = {
      ...invitationFixture,
      sections: invitationFixture.sections.map((section) =>
        section.type === "venue" ? { ...section, visible: false } : section,
      ),
    };

    const html = renderToStaticMarkup(
      <InvitationRenderer document={hiddenVenueDocument} mode="preview" reducedMotion />,
    );

    expect(html).not.toContain("The Glass Garden");
    expect(html).toContain('data-motion-enabled="false"');
    expect(html).toContain('data-render-mode="preview"');
  });

  it("resolves only allowlisted template renderers", () => {
    expect(resolveTemplateRenderer("standard-v1")).toBe(InvitationRenderer);
    expect(resolveTemplateRenderer("garden-promise-v1")).toBe(GardenPromiseRenderer);
    expect(resolveTemplateRenderer("garden-promise-v2")).toBe(GardenPromiseRendererV2);
    expect(resolveTemplateRenderer("golden-hour-v2")).toBe(GoldenHourRendererV2);
    expect(resolveTemplateRenderer("sunday-joy-v2")).toBe(SundayJoyRendererV2);
    expect(resolveTemplateRenderer("little-blessings-v1")).toBe(LittleBlessingsRenderer);
    expect(resolveTemplateRenderer("little-blessings-v2")).toBe(LittleBlessingsRendererV2);
    expect(resolveTemplateRendererRegistration("little-blessings-v1").version).toBe(1);
    expect(resolveTemplateRendererRegistration("little-blessings-v2").version).toBe(2);
    expect(resolveTemplateRenderer("little-blessings-v2")).not.toBe(LittleBlessingsRenderer);
    expect(() => resolveTemplateRenderer("remote-template-code")).toThrow(
      UnknownTemplateRendererError,
    );
  });

  it("lazy-loads the same versioned renderer registrations", async () => {
    await expect(loadTemplateRendererRegistration("garden-promise-v1")).resolves.toEqual({
      component: GardenPromiseRenderer,
      rendererKey: "garden-promise-v1",
      version: 1,
    });
    await expect(loadTemplateRendererRegistration("garden-promise-v2")).resolves.toEqual({
      component: GardenPromiseRendererV2,
      rendererKey: "garden-promise-v2",
      version: 2,
    });
    await expect(loadTemplateRendererRegistration("golden-hour-v2")).resolves.toEqual({
      component: GoldenHourRendererV2,
      rendererKey: "golden-hour-v2",
      version: 2,
    });
    await expect(loadTemplateRendererRegistration("little-blessings-v2")).resolves.toEqual({
      component: LittleBlessingsRendererV2,
      rendererKey: "little-blessings-v2",
      version: 2,
    });
    await expect(loadTemplateRendererRegistration("sunday-joy-v2")).resolves.toEqual({
      component: SundayJoyRendererV2,
      rendererKey: "sunday-joy-v2",
      version: 2,
    });
    await expect(loadTemplateRendererRegistration("remote-template-code")).rejects.toThrow(
      UnknownTemplateRendererError,
    );
  });

  it("parses and renders a publication snapshot through its pinned allowlisted renderer", () => {
    const gardenPromise = templateRegistry.find(
      (manifest) => manifest.listing.id === "garden-promise",
    );

    if (!gardenPromise) {
      throw new Error("Garden Promise fixture is required");
    }

    const registration = resolveTemplateRendererRegistration(gardenPromise.rendererKey);
    const snapshot = parsePublicationSnapshot({
      snapshotVersion: 1,
      invitationSchemaVersion: gardenPromise.schemaVersion,
      rendererKey: gardenPromise.rendererKey,
      rendererVersion: registration.version,
      templateVersionId: gardenPromise.templateVersionId,
      templateVersion: gardenPromise.version,
      draftRevision: 4,
      document: gardenPromise.defaultDocument,
      assets: [],
    });
    const Renderer = resolveTemplateRenderer(snapshot.rendererKey);
    const html = renderToStaticMarkup(
      <Renderer document={snapshot.document} mode="published" reducedMotion />,
    );

    expect(snapshot.rendererVersion).toBe(registration.version);
    expect(html).toContain("Mara &amp; Joaquin");
    expect(html).toContain('data-render-mode="published"');
  });

  it("server-renders Garden Promise with readable fallback content before interaction", () => {
    const gardenPromise = templateRegistry.find(
      (manifest) => manifest.listing.id === "garden-promise",
    );

    if (!gardenPromise) {
      throw new Error("Garden Promise fixture is required");
    }

    const html = renderToStaticMarkup(
      <GardenPromiseRenderer
        audience="personalized"
        document={gardenPromise.defaultDocument}
        mode="published"
        recipientName="The Villanueva and de la Cruz Family"
        reducedMotion
      />,
    );

    expect(html).toContain("The Villanueva and de la Cruz Family");
    expect(html).toContain("Mara &amp; Joaquin");
    expect(html).toContain("Hiraya Garden Pavilion");
    expect(html).toContain("Kindly reply by December 17, 2026");
    expect(html).toContain("Preparing invitation…");
    expect(html).toContain(
      'aria-label="Preparing invitation for The Villanueva and de la Cruz Family"',
    );
    expect(html).toContain("Use your personalized invitation link to respond");
    expect(html).toContain('data-opening-state="closed"');
    expect(html).toContain('data-motion-enabled="false"');
    expect(html).toContain('data-envelope-gated="false"');
    expect(html).not.toContain(" inert");
  });

  it("fills the RSVP slot without changing the invitation document", () => {
    const html = renderToStaticMarkup(
      <InvitationRenderer
        audience="personalized"
        document={invitationFixture}
        mode="published"
        rsvpSlot={<form aria-label="RSVP reply">Reply controls</form>}
      />,
    );

    expect(html).toContain('data-rsvp-slot="true"');
    expect(html).toContain('aria-label="RSVP reply"');
    expect(html).toContain("Reply controls");
    expect(html).not.toContain("Use your personalized invitation link to respond");
  });

  it("applies the general-link reply boundary to every renderer", () => {
    const gardenPromise = templateRegistry.find(
      (manifest) => manifest.listing.id === "garden-promise" && manifest.version === 1,
    );
    const littleBlessings = templateRegistry.find(
      (manifest) => manifest.listing.id === "little-blessings" && manifest.version === 1,
    );

    if (!gardenPromise || !littleBlessings) {
      throw new Error("Production template fixtures are required");
    }

    const renderers = [
      {
        marker: 'data-section-type="rsvp"',
        render: (audience: "general" | "personalized", mode: "preview" | "published") =>
          renderToStaticMarkup(
            <InvitationRenderer audience={audience} document={invitationFixture} mode={mode} />,
          ),
      },
      {
        marker: "Kindly reply by December 17, 2026",
        render: (audience: "general" | "personalized", mode: "preview" | "published") =>
          renderToStaticMarkup(
            <GardenPromiseRenderer
              audience={audience}
              document={gardenPromise.defaultDocument}
              mode={mode}
            />,
          ),
      },
      {
        marker: 'class="lb-section lb-rsvp"',
        render: (audience: "general" | "personalized", mode: "preview" | "published") =>
          renderToStaticMarkup(
            <LittleBlessingsRenderer
              audience={audience}
              document={littleBlessings.defaultDocument}
              mode={mode}
            />,
          ),
      },
    ];

    for (const { marker, render } of renderers) {
      expect(render("general", "published")).not.toContain(marker);
      expect(render("personalized", "published")).toContain(marker);
      expect(render("general", "preview")).toContain(marker);
    }
  });

  it("renders every registered template fixture through its allowlisted renderer", () => {
    for (const manifest of templateRegistry) {
      const Renderer = resolveTemplateRenderer(manifest.rendererKey);
      const html = renderToStaticMarkup(
        <Renderer document={manifest.defaultDocument} mode="preview" />,
      );
      const hero = manifest.defaultDocument.sections.find((section) => section.type === "hero");

      if (!hero) {
        throw new Error(`Template ${manifest.listing.id} requires a hero section`);
      }

      // Every word of the hero title must survive; some renderers split it across elements
      // (e.g. Little Blessings accents the given name), so assert per word rather than verbatim.
      for (const word of hero.props.title.split(/\s+/)) {
        expect(html).toContain(renderToStaticMarkup(word));
      }
      expect(html).toContain(`data-invitation-schema-version="${manifest.schemaVersion}"`);
      expect(html).toContain('data-opening-state="closed"');
      expect(html).toContain("Preparing invitation for");
      expect(html).toContain('data-envelope-gated="false"');
    }
  });

  it("renders each expanded occasion through its dedicated composition", () => {
    const versions = [
      {
        id: "garden-promise",
        marker: 'data-template="garden-promise"',
        renderer: GardenPromiseRendererV2,
        sectionCount: 11,
        variant: "garden-promise",
      },
      {
        id: "golden-hour",
        marker: 'data-template="golden-hour"',
        renderer: GoldenHourRendererV2,
        sectionCount: 10,
        variant: "golden-hour",
      },
      {
        id: "sunday-joy",
        marker: 'data-template="sunday-joy"',
        renderer: SundayJoyRendererV2,
        sectionCount: 10,
        variant: "sunday-joy",
      },
    ] as const;

    for (const version of versions) {
      const manifest = templateRegistry.find(
        (candidate) => candidate.listing.id === version.id && candidate.version === 2,
      );
      if (!manifest) throw new Error(`${version.id} v2 fixture is required`);

      expect(resolveTemplateRenderer(manifest.rendererKey)).toBe(version.renderer);

      const Renderer = version.renderer;
      const html = renderToStaticMarkup(
        <Renderer
          audience="personalized"
          document={manifest.defaultDocument}
          mode="published"
          reducedMotion
        />,
      );

      expect(html).toContain(version.marker);
      expect(html).toContain(`data-envelope-variant="${version.variant}"`);
      expect(html).toContain('data-motion-enabled="false"');
      expect(html).not.toContain('class="sr-root"');
      expect(manifest.defaultDocument.sections).toHaveLength(version.sectionCount);
      for (const section of manifest.defaultDocument.sections.filter((item) => item.visible)) {
        expect(html).toContain(`data-section-type="${section.type}"`);
      }
    }
  });

  /**
   * "Portrait pending creator upload" is written for a creator looking at an empty slot. On a
   * published invitation whose creator simply never added a photograph, a guest using a screen
   * reader would otherwise hear it read out as part of the invitation. The gallery and gift slots
   * were already silent; the hero one was not.
   */
  it("keeps every unfilled media slot out of the accessibility tree", () => {
    for (const manifest of templateRegistry.filter(
      (candidate) =>
        candidate.version === 2 &&
        ["garden-promise", "golden-hour", "sunday-joy"].includes(candidate.listing.id),
    )) {
      const Renderer = resolveTemplateRenderer(manifest.rendererKey);
      const html = renderToStaticMarkup(
        <Renderer
          audience="personalized"
          document={manifest.defaultDocument}
          mode="published"
          reducedMotion
        />,
      );

      const placeholders = [...html.matchAll(/<div([^>]*)class="ot-media-placeholder/g)];
      expect([manifest.listing.id, placeholders.length]).toEqual([
        manifest.listing.id,
        manifest.defaultDocument.assets.length,
      ]);
      for (const match of placeholders) {
        expect([manifest.listing.id, (match[1] ?? "").includes('aria-hidden="true"')]).toEqual([
          manifest.listing.id,
          true,
        ]);
      }
    }
  });

  /**
   * The hero medallion is a 24%-opacity watermark sitting directly behind the eyebrow and title. A
   * numeral there reads as a grey artifact rather than an ornament, so the glyph is set only on the
   * envelope cover and in the footer, where the medallion is small and fully opaque.
   */
  it("sets the debut numeral only where the medallion is not behind live type", () => {
    const goldenHour = templateRegistry.find(
      (candidate) => candidate.listing.id === "golden-hour" && candidate.version === 2,
    );
    if (!goldenHour) throw new Error("Golden Hour v2 fixture is required");

    const html = renderToStaticMarkup(
      <GoldenHourRendererV2
        audience="personalized"
        document={goldenHour.defaultDocument}
        mode="published"
        reducedMotion
      />,
    );

    expect(html).toContain('data-context="cover" data-motif="golden-hour"><b>XVIII</b>');
    expect(html).not.toContain('data-context="hero" data-motif="golden-hour"><b>');
  });

  it("keeps the Golden Hour page free of repeating diagonal rays", () => {
    const goldenHour = templateRegistry.find(
      (candidate) => candidate.listing.id === "golden-hour" && candidate.version === 2,
    );
    if (!goldenHour) throw new Error("Golden Hour v2 fixture is required");

    const html = renderToStaticMarkup(
      <GoldenHourRendererV2
        audience="personalized"
        document={goldenHour.defaultDocument}
        mode="published"
        reducedMotion
      />,
    );

    expect(html).not.toContain("linear-gradient(135deg, transparent 48%");
    expect(html).not.toContain("background-size: 24rem 24rem");
  });

  it("keeps the personal-link RSVP boundary in every expanded occasion renderer", () => {
    for (const manifest of templateRegistry.filter(
      (candidate) =>
        candidate.version === 2 &&
        ["garden-promise", "golden-hour", "sunday-joy"].includes(candidate.listing.id),
    )) {
      const Renderer = resolveTemplateRenderer(manifest.rendererKey);
      const render = (audience: "general" | "personalized") =>
        renderToStaticMarkup(
          <Renderer audience={audience} document={manifest.defaultDocument} mode="published" />,
        );

      expect(render("general")).not.toContain('data-section-type="rsvp"');
      expect(render("personalized")).toContain('data-section-type="rsvp"');
    }
  });

  it("keeps published envelope scenes at least as tall as the viewport", () => {
    for (const manifest of templateRegistry) {
      const Renderer = resolveTemplateRenderer(manifest.rendererKey);
      const html = renderToStaticMarkup(
        <Renderer document={manifest.defaultDocument} mode="published" />,
      );

      expect(html).toContain('data-render-mode="published"');
      expect(html).toContain("min-height: 100svh");
    }
  });

  it("renders the Little Blessings fixture truthfully without pretending media is uploaded", () => {
    const littleBlessings = templateRegistry.find(
      (manifest) => manifest.listing.id === "little-blessings",
    );

    if (!littleBlessings) {
      throw new Error("Little Blessings fixture is required");
    }

    const Renderer = resolveTemplateRenderer(littleBlessings.rendererKey);
    const html = renderToStaticMarkup(
      <Renderer document={littleBlessings.defaultDocument} mode="preview" reducedMotion />,
    );

    expect(littleBlessings.qualityStatus).toBe("production");
    expect(html).toContain(">Eliana</em>");
    expect(html).toContain(">Grace</span>");
    expect(html).toContain("New Hope Community Church");
    expect(html).toContain(">Tito</h3>");
    expect(html).toContain(">Tita</h3>");
    // The parents now sign the dedication instead of appearing as a sponsor group.
    expect(html).toContain("With love, her parents");
    expect(html).toContain('class="lb-signature"');
    expect(html).toContain("Board books");
    // The closed cover is titled, and every word on it also exists as real text below.
    expect(html).toContain('class="lb-cover-plate"');
    expect(html).toContain("A christening keepsake");
    expect(html).toContain('class="iv-powered"');
    // The agenda leads each line with its time, in its own column class. A shared `p` class here
    // would put the time in the description's grid column and drop it onto a second row.
    expect(html).toContain('<p class="lb-schedule-time">8:40 AM</p><h3>Guests arrive</h3>');
    expect(html).toContain("Baby portrait pending creator upload");
    expect(html).toContain('data-section-type="gallery"');
    expect(html).toContain('data-section-type="gifts"');
    expect(html).not.toContain("<img");
  });

  it("renders resolved responsive images while keeping placeholders for unresolved slots", () => {
    const littleBlessings = templateRegistry.find(
      (manifest) => manifest.listing.id === "little-blessings",
    );

    if (!littleBlessings) {
      throw new Error("Little Blessings fixture is required");
    }

    const heroAssetId = "45000000-0000-4000-8000-000000000001";
    const heroSha = "a".repeat(64);
    const resolveImage = (assetId: string) =>
      assetId === heroAssetId
        ? {
            height: 1200,
            renditions: [
              { height: 480, url: `/m/v1/${heroSha}/w640.webp`, width: 640 },
              { height: 240, url: `/m/v1/${heroSha}/w320.webp`, width: 320 },
            ],
            width: 1600,
          }
        : null;

    const html = renderToStaticMarkup(
      <InvitationRenderer
        document={littleBlessings.defaultDocument}
        mode="published"
        resolveImage={resolveImage}
      />,
    );

    // The resolved hero renders a real responsive image with reserved dimensions...
    expect(html).toContain("<img");
    expect(html).toContain('width="1600"');
    expect(html).toContain('height="1200"');
    expect(html).toContain(`/m/v1/${heroSha}/w320.webp 320w`);
    expect(html).toContain(`/m/v1/${heroSha}/w640.webp 640w`);
    expect(html).toContain('loading="eager"');
    expect(html).not.toContain("Baby portrait pending creator upload");
    // ...while every unresolved gallery and gift slot keeps its readable fallback.
    expect(html).toContain("Image pending creator upload");
    expect(html).toContain("Gift image pending creator upload");
  });

  it("renders the Little Blessings fixture through the Keepsake Storybook family renderer", () => {
    const littleBlessings = templateRegistry.find(
      (manifest) => manifest.listing.id === "little-blessings",
    );

    if (!littleBlessings) {
      throw new Error("Little Blessings fixture is required");
    }

    expect(littleBlessings.rendererKey).toBe("little-blessings-v1");
    expect(resolveTemplateRenderer(littleBlessings.rendererKey)).toBe(LittleBlessingsRenderer);

    const html = renderToStaticMarkup(
      <LittleBlessingsRenderer
        audience="personalized"
        document={littleBlessings.defaultDocument}
        mode="published"
        recipientName="The Reyes Family"
        reducedMotion
      />,
    );

    // Keepsake Storybook identity, not the recolored standard shell.
    expect(html).toContain('class="lb-root"');
    expect(html).toContain('data-envelope-variant="little-blessings"');
    expect(html).toContain("A little blessing awaits");
    expect(html).toContain("Prepared with love for");
    expect(html).toContain("lb-mark");
    expect(html).toContain("With grateful hearts, thank you for celebrating with us");
    expect(html).not.toContain('class="sr-root"');

    // Every supported section renders semantically through the shared contract.
    for (const sectionType of [
      "hero",
      "message",
      "countdown",
      "event-details",
      "participants",
      "schedule",
      "rsvp",
      "attire",
      "gallery",
      "guidance",
      "gifts",
    ]) {
      expect(html).toContain(`data-section-type="${sectionType}"`);
    }

    expect(html).toContain("Preparing invitation for The Reyes Family");
    expect(html).toContain(">Eliana</em>");
    expect(html).toContain(">Grace</span>");
    expect(html).toContain("Sunday, April 11, 2027 at 9:00 AM");
    expect(html).toContain("Kindly reply by March 28, 2027");
    expect(html).toContain("Blush pink");
    expect(html).toContain('data-opening-state="closed"');
    expect(html).toContain('data-envelope-gated="false"');
    expect(html).toContain('data-render-mode="published"');
  });

  it("keeps truthful media fallbacks and delivers resolved images in the family renderer", () => {
    const littleBlessings = templateRegistry.find(
      (manifest) => manifest.listing.id === "little-blessings",
    );

    if (!littleBlessings) {
      throw new Error("Little Blessings fixture is required");
    }

    const fallbackHtml = renderToStaticMarkup(
      <LittleBlessingsRenderer
        document={littleBlessings.defaultDocument}
        mode="preview"
        reducedMotion
      />,
    );

    expect(fallbackHtml).toContain("Baby portrait pending creator upload");
    expect(fallbackHtml).toContain("Image pending creator upload");
    expect(fallbackHtml).toContain("Gift image pending creator upload");
    expect(fallbackHtml).not.toContain("<img");

    const heroAssetId = "45000000-0000-4000-8000-000000000001";
    const galleryAssetId = "45000000-0000-4000-8000-000000000002";
    const heroSha = "c".repeat(64);
    const resolveImage = (assetId: string) =>
      assetId === heroAssetId || assetId === galleryAssetId
        ? {
            height: 1200,
            renditions: [
              { height: 480, url: `/m/v1/${heroSha}/w640.webp`, width: 640 },
              { height: 240, url: `/m/v1/${heroSha}/w320.webp`, width: 320 },
            ],
            width: 1600,
          }
        : null;

    const resolvedHtml = renderToStaticMarkup(
      <LittleBlessingsRenderer
        document={littleBlessings.defaultDocument}
        mode="published"
        resolveImage={resolveImage}
      />,
    );

    expect(resolvedHtml).toContain("<img");
    expect(resolvedHtml).toContain('width="640"');
    expect(resolvedHtml).toContain('height="480"');
    expect(resolvedHtml).toContain(`/m/v1/${heroSha}/w320.webp 320w`);
    expect(resolvedHtml).toContain(`/m/v1/${heroSha}/w640.webp 640w`);
    expect(resolvedHtml).toContain('loading="eager"');
    expect(resolvedHtml).toContain('loading="lazy"');
    expect(resolvedHtml).toContain('data-photo-orientation="landscape"');
    expect(resolvedHtml).toContain('class="ip-photo-trigger lb-hero-photo-trigger"');
    expect(resolvedHtml).toContain("counter(lb-page, upper-roman)");
    expect(resolvedHtml).not.toContain('symbols: "one"');
    expect(resolvedHtml).not.toContain("aspect-ratio: 4 / 5");
    // The figcaption names the figure, so the image never repeats that text to a screen reader.
    expect(resolvedHtml).not.toContain('alt="Eliana resting in a light blanket"');
    expect(resolvedHtml).toContain("View photo: Eliana resting in a light blanket");
    expect(resolvedHtml).not.toContain("Baby portrait pending creator upload");
    expect(resolvedHtml).toContain("Gift image pending creator upload");
  });

  it("renders every gallery caption state and never leaves a photo control unnamed", () => {
    const littleBlessings = templateRegistry.find(
      (manifest) => manifest.listing.id === "little-blessings",
    );

    if (!littleBlessings) {
      throw new Error("Little Blessings fixture is required");
    }

    const gallerySha = "b".repeat(64);
    const gallery = littleBlessings.defaultDocument.sections.find(
      (section) => section.type === "gallery",
    );
    const galleryAssetIds = new Set(gallery?.props.images.map((image) => image.assetId));
    const resolveImage = (assetId: string) =>
      galleryAssetIds.has(assetId)
        ? {
            height: 900,
            renditions: [{ height: 240, url: `/m/v1/${gallerySha}/w320.webp`, width: 320 }],
            width: 1200,
          }
        : null;

    const html = renderToStaticMarkup(
      <LittleBlessingsRenderer
        document={littleBlessings.defaultDocument}
        mode="published"
        resolveImage={resolveImage}
      />,
    );

    expect(html).toContain('loading="lazy"');
    // Title with caption, title alone, caption alone.
    expect(html).toContain(
      "<strong>Eliana resting in a light blanket</strong><span>Our first quiet afternoon together</span>",
    );
    expect(html).toContain("<strong>Eliana asleep against her mother&#x27;s shoulder</strong>");
    expect(html).toContain("<figcaption><span>A morning in the garden</span></figcaption>");
    // A photograph with no writing under it emits no figcaption at all, not an empty one.
    expect(html).not.toContain("<figcaption></figcaption>");
    // …and its control still has a name, falling back to the photo's place in the album.
    expect(html).toContain("View photo 8 of 8");
  });

  it("withholds the reply page from a general link but never from an invited guest", () => {
    const littleBlessings = templateRegistry.find(
      (manifest) => manifest.listing.id === "little-blessings",
    );

    if (!littleBlessings) {
      throw new Error("Little Blessings fixture is required");
    }

    const render = (props: Partial<Parameters<typeof LittleBlessingsRenderer>[0]>) =>
      renderToStaticMarkup(
        <LittleBlessingsRenderer
          document={littleBlessings.defaultDocument}
          mode="published"
          {...props}
        />,
      );

    // Matched on the rendered element, not on `data-section-type`, which the stylesheet also names.
    const replyPage = '<section class="lb-section lb-rsvp"';

    // Published with no guest token, including the server-rendered default: withheld.
    expect(render({})).not.toContain(replyPage);
    expect(render({ audience: "general" })).not.toContain(replyPage);
    // Published with a guest token: shown, whether or not the guest context resolved.
    expect(render({ audience: "personalized" })).toContain(replyPage);
    // Preview always shows it, or the creator could not edit it.
    expect(render({ audience: "general", mode: "preview" })).toContain(replyPage);

    // Withholding the page must not disturb anything above it.
    expect(render({})).toContain("Gift ideas");
    expect(render({})).toContain("Where and when");
  });

  it("shows every audience its own dress code alongside the shared guidance", () => {
    const littleBlessings = templateRegistry.find(
      (manifest) => manifest.listing.id === "little-blessings",
    );

    if (!littleBlessings) {
      throw new Error("Little Blessings fixture is required");
    }

    for (const html of [
      renderToStaticMarkup(
        <LittleBlessingsRenderer document={littleBlessings.defaultDocument} mode="published" />,
      ),
      renderToStaticMarkup(
        <InvitationRenderer document={littleBlessings.defaultDocument} mode="published" />,
      ),
    ]) {
      expect(html).toContain("Sunday best in light, comfortable colors.");
      expect(html).toContain("<h3>Ninong and ninang</h3>");
      expect(html).toContain("<h3>Our guests</h3>");
      expect(html).toContain("Barong Tagalog for the titos");
    }
  });
});
