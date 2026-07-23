import { describe, expect, it } from "vitest";

import {
  invitationDocumentV1Schema,
  parseInvitationDocument,
  safeParseInvitationDocument,
  UnsupportedInvitationSchemaVersionError,
} from "../src/index.js";
import { invitationFixture } from "../src/testing.js";

describe("invitation document schema", () => {
  it("parses a valid version one document", () => {
    expect(parseInvitationDocument(invitationFixture)).toEqual(invitationFixture);
  });

  it("rejects unsupported schema versions before rendering", () => {
    expect(() =>
      parseInvitationDocument({
        ...invitationFixture,
        schemaVersion: 2,
      }),
    ).toThrow(UnsupportedInvitationSchemaVersionError);
  });

  it("rejects duplicate section IDs", () => {
    const duplicateSection = invitationFixture.sections[0];

    expect(duplicateSection).toBeDefined();

    const result = invitationDocumentV1Schema.safeParse({
      ...invitationFixture,
      sections: [...invitationFixture.sections, duplicateSection],
    });

    expect(result.success).toBe(false);
  });

  it("rejects arbitrary HTML at the document boundary", () => {
    const result = safeParseInvitationDocument({
      ...invitationFixture,
      rawHtml: "<script>alert('unsafe')</script>",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsupported section types", () => {
    const result = safeParseInvitationDocument({
      ...invitationFixture,
      sections: [
        ...invitationFixture.sections,
        {
          id: "20000000-0000-4000-8000-000000000099",
          type: "custom-code",
          visible: true,
          animationPreset: "none",
          props: {},
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("allows only HTTP and HTTPS venue links", () => {
    const sections = invitationFixture.sections.map((section) =>
      section.type === "venue"
        ? { ...section, props: { ...section.props, mapUrl: "javascript:alert('unsafe')" } }
        : section,
    );

    expect(safeParseInvitationDocument({ ...invitationFixture, sections }).success).toBe(false);
  });

  it("accepts the maximum supported Garden Promise field lengths", () => {
    const sections = invitationFixture.sections.map((section) => {
      if (section.type === "hero") {
        return {
          ...section,
          props: {
            ...section.props,
            dateLabel: "D".repeat(120),
            subtitle: "S".repeat(240),
            title: "T".repeat(120),
          },
        };
      }
      if (section.type === "venue") {
        return {
          ...section,
          props: {
            ...section.props,
            address: "A".repeat(500),
            venueName: "V".repeat(120),
          },
        };
      }
      if (section.type === "rsvp") {
        return { ...section, props: { ...section.props, message: "R".repeat(500) } };
      }
      return section;
    });

    expect(safeParseInvitationDocument({ ...invitationFixture, sections }).success).toBe(true);
  });
});
