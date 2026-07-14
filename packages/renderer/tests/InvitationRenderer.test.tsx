import { invitationFixture } from "@invitica/invitation-schema/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InvitationRenderer } from "../src/index.js";

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
});
