import { parsePublicationSnapshot } from "@invitica/invitation-schema";
import { invitationFixture } from "@invitica/invitation-schema/testing";
import { templateRegistry } from "@invitica/template-kit";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  GardenPromiseRenderer,
  InvitationRenderer,
  resolveTemplateRenderer,
  resolveTemplateRendererRegistration,
  UnknownTemplateRendererError,
} from "../src/index.js";

describe("InvitationRenderer", () => {
  it("renders the same document contract for a published personalized invitation", () => {
    const html = renderToStaticMarkup(
      <InvitationRenderer
        document={invitationFixture}
        mode="published"
        recipientName="Uncle John"
      />,
    );

    expect(html).toContain("Open invitation for Uncle John");
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
    expect(() => resolveTemplateRenderer("remote-template-code")).toThrow(
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
    expect(html).toContain("Tap the invitation card to open");
    expect(html).toContain('aria-label="Open invitation for The Villanueva and de la Cruz Family"');
    expect(html).toContain("Use your personalized invitation link to respond");
    expect(html).toContain('data-opening-state="closed"');
    expect(html).toContain('data-motion-enabled="false"');
    expect(html).toContain('data-envelope-gated="false"');
    expect(html).not.toContain(" inert");
  });

  it("fills the RSVP slot without changing the invitation document", () => {
    const html = renderToStaticMarkup(
      <InvitationRenderer
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

      expect(html).toContain(renderToStaticMarkup(hero.props.title));
      expect(html).toContain(`data-invitation-schema-version="${manifest.schemaVersion}"`);
      expect(html).toContain('data-opening-state="closed"');
      expect(html).toContain("Open invitation for");
      expect(html).toContain('data-envelope-gated="false"');
    }
  });
});
