import { invitationFixture } from "@invitica/invitation-schema/testing";
import { templateRegistry } from "@invitica/template-kit";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  InvitationRenderer,
  resolveTemplateRenderer,
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

    expect(html).toContain("To: Uncle John");
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
    expect(() => resolveTemplateRenderer("remote-template-code")).toThrow(
      UnknownTemplateRendererError,
    );
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
    }
  });
});
