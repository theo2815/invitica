import { describe, expect, it } from "vitest";

import {
  gallerySectionSchema,
  giftsSectionSchema,
  invitationDocumentV1Schema,
  parseInvitationDocument,
  safeParseInvitationDocument,
  UnsupportedInvitationSchemaVersionError,
} from "../src/index.js";
import { invitationFixture } from "../src/testing.js";

const galleryAssetId = "46000000-0000-4000-8000-000000000001";
const giftAssetId = "46000000-0000-4000-8000-000000000002";

function additiveSectionDocument() {
  return invitationDocumentV1Schema.parse({
    ...invitationFixture,
    sections: [
      ...invitationFixture.sections,
      {
        id: "47000000-0000-4000-8000-000000000001",
        type: "countdown",
        visible: true,
        animationPreset: "fade-in",
        props: {
          heading: "Until the celebration",
          target: "2027-04-11T09:00:00+08:00",
          dateLabel: "Sunday, April 11, 2027 at 9:00 AM",
        },
      },
      {
        id: "47000000-0000-4000-8000-000000000002",
        type: "event-details",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Where and when",
          events: [
            {
              label: "Christening ceremony",
              startAt: "2027-04-11T09:00:00+08:00",
              dateLabel: "9:00 AM",
              venueName: "New Hope Community Church",
              address: "Quezon City, Metro Manila",
              mapUrl: "https://maps.google.com/",
              arrivalNote: "Please arrive 20 minutes early.",
            },
          ],
        },
      },
      {
        id: "47000000-0000-4000-8000-000000000003",
        type: "participants",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "With our family",
          groups: [{ label: "Parents", names: ["Mika Reyes", "Daniel Reyes"] }],
        },
      },
      {
        id: "47000000-0000-4000-8000-000000000004",
        type: "schedule",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Order of the day",
          items: [{ timeLabel: "9:00 AM", title: "Christening ceremony" }],
        },
      },
      {
        id: "47000000-0000-4000-8000-000000000005",
        type: "attire",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "What to wear",
          description: "Sunday best in light, comfortable colors.",
          colors: [{ label: "Quiet sage", value: "#87927a" }],
        },
      },
      {
        id: "47000000-0000-4000-8000-000000000006",
        type: "gallery",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Little moments",
          images: [{ assetId: galleryAssetId, alt: "A fictional baby portrait" }],
        },
      },
      {
        id: "47000000-0000-4000-8000-000000000007",
        type: "guidance",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "A gentle note",
          items: ["Please ask before posting photographs online."],
        },
      },
      {
        id: "47000000-0000-4000-8000-000000000008",
        type: "gifts",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Gift ideas",
          items: [
            {
              imageAssetId: giftAssetId,
              name: "Board books",
              note: "Stories the family can enjoy together",
            },
          ],
        },
      },
    ],
    assets: [
      { id: galleryAssetId, kind: "image" },
      { id: giftAssetId, kind: "image" },
    ],
  });
}

describe("invitation document schema", () => {
  it("parses a valid version one document", () => {
    expect(parseInvitationDocument(invitationFixture)).toEqual(invitationFixture);
  });

  it("keeps older version one documents readable after additive section expansion", () => {
    expect(parseInvitationDocument(invitationFixture)).toEqual(invitationFixture);
    expect(safeParseInvitationDocument(additiveSectionDocument()).success).toBe(true);
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

  it("enforces the bounded gallery and gift collection limits", () => {
    const galleryImages = Array.from({ length: 8 }, (_, index) => ({
      assetId: `46000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      alt: `Fictional gallery image ${index + 1}`,
    }));
    const giftItems = Array.from({ length: 6 }, (_, index) => ({
      name: `Gift idea ${index + 1}`,
    }));
    const base = {
      id: "47000000-0000-4000-8000-000000000099",
      visible: true,
      animationPreset: "none",
    };

    expect(
      gallerySectionSchema.safeParse({
        ...base,
        type: "gallery",
        props: { images: galleryImages },
      }).success,
    ).toBe(true);
    expect(
      gallerySectionSchema.safeParse({
        ...base,
        type: "gallery",
        props: { images: [...galleryImages, galleryImages[0]] },
      }).success,
    ).toBe(false);
    expect(
      giftsSectionSchema.safeParse({ ...base, type: "gifts", props: { items: giftItems } }).success,
    ).toBe(true);
    expect(
      giftsSectionSchema.safeParse({
        ...base,
        type: "gifts",
        props: { items: [...giftItems, { name: "One gift too many" }] },
      }).success,
    ).toBe(false);
  });

  it("rejects missing or incorrectly typed section asset references", () => {
    const document = additiveSectionDocument();

    expect(
      safeParseInvitationDocument({
        ...document,
        assets: document.assets.filter((asset) => asset.id !== galleryAssetId),
      }).success,
    ).toBe(false);
    expect(
      safeParseInvitationDocument({
        ...document,
        assets: document.assets.map((asset) =>
          asset.id === giftAssetId ? { ...asset, kind: "audio" } : asset,
        ),
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe event-detail map links", () => {
    const document = additiveSectionDocument();
    const sections = document.sections.map((section) =>
      section.type === "event-details"
        ? {
            ...section,
            props: {
              ...section.props,
              events: section.props.events.map((event) => ({
                ...event,
                mapUrl: "javascript:alert('unsafe')",
              })),
            },
          }
        : section,
    );

    expect(safeParseInvitationDocument({ ...document, sections }).success).toBe(false);
  });

  it("accepts optional in-range venue coordinates on event-detail items", () => {
    const document = additiveSectionDocument();
    const sections = document.sections.map((section) =>
      section.type === "event-details"
        ? {
            ...section,
            props: {
              ...section.props,
              events: section.props.events.map((event) => ({
                ...event,
                latitude: 14.6507,
                longitude: 121.0494,
              })),
            },
          }
        : section,
    );

    expect(safeParseInvitationDocument({ ...document, sections }).success).toBe(true);
  });

  it("accepts an optional signature on a message section", () => {
    const document = additiveSectionDocument();
    const sections = document.sections.map((section) =>
      section.type === "message"
        ? {
            ...section,
            props: {
              ...section.props,
              signature: { lead: "With love,", names: ["Mika Reyes", "Daniel Reyes"] },
            },
          }
        : section,
    );

    expect(safeParseInvitationDocument({ ...document, sections }).success).toBe(true);
  });

  it("rejects an empty or oversized message signature", () => {
    const document = additiveSectionDocument();
    const withSignature = (signature: unknown) =>
      document.sections.map((section) =>
        section.type === "message"
          ? { ...section, props: { ...section.props, signature } }
          : section,
      );

    expect(
      safeParseInvitationDocument({ ...document, sections: withSignature({ names: [] }) }).success,
    ).toBe(false);
    expect(
      safeParseInvitationDocument({
        ...document,
        sections: withSignature({ names: ["A", "B", "C", "D", "E"] }),
      }).success,
    ).toBe(false);
    expect(
      safeParseInvitationDocument({
        ...document,
        sections: withSignature({ names: ["Mika Reyes"], relation: "Parents" }),
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range venue coordinates", () => {
    const document = additiveSectionDocument();
    const sections = document.sections.map((section) =>
      section.type === "event-details"
        ? {
            ...section,
            props: {
              ...section.props,
              events: section.props.events.map((event) => ({
                ...event,
                latitude: 14.6507,
                longitude: 999,
              })),
            },
          }
        : section,
    );

    expect(safeParseInvitationDocument({ ...document, sections }).success).toBe(false);
  });
});
