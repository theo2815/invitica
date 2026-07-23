export const gardenPromiseTemplate = {
  listing: {
    id: "garden-promise",
    occasion: "Wedding",
    name: "Garden Promise",
    previewTitle: "Mara & Joaquin",
    date: "January 17, 2027 · Manila",
    tier: "Free",
    style: "Romantic botanical",
    description:
      "A quiet garden composition with sage paper, fine borders, and generous space for a personal story.",
  },
  templateVersionId: "40000000-0000-4000-8000-000000000001",
  version: 1,
  qualityStatus: "production",
  rendererKey: "garden-promise-v1",
  schemaVersion: 1,
  allowedSections: ["hero", "message", "venue", "rsvp"],
  defaultDocument: {
    schemaVersion: 1,
    templateVersionId: "40000000-0000-4000-8000-000000000001",
    locale: "en-PH",
    eventTimezone: "Asia/Manila",
    theme: {
      colors: {
        background: "#e8eadf",
        surface: "#fffdf6",
        text: "#344033",
        accent: "#687a5a",
        accentContrast: "#ffffff",
      },
      typography: {
        headingFontId: "fraunces",
        bodyFontId: "instrument-sans",
      },
      spacingScale: "spacious",
    },
    opening: {
      preset: "ribbon-envelope-letter",
      motionStyle: "elegant",
      recipientMode: "personalized",
      fallbackRecipientText: "Our dear guest",
    },
    sections: [
      {
        id: "41000000-0000-4000-8000-000000000001",
        type: "hero",
        visible: true,
        animationPreset: "fade-in",
        props: {
          eyebrow: "Together with their families",
          title: "Mara & Joaquin",
          subtitle: "Invite you to celebrate a promise made in the garden",
          dateLabel: "Sunday, January 17, 2027",
        },
      },
      {
        id: "41000000-0000-4000-8000-000000000002",
        type: "message",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "With joyful hearts",
          body: "Join us for an afternoon of vows, shared tables, and the people who helped our story grow.",
        },
      },
      {
        id: "41000000-0000-4000-8000-000000000003",
        type: "venue",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "The celebration",
          venueName: "Hiraya Garden Pavilion",
          address: "Silang, Cavite, Philippines",
          mapUrl: "https://maps.google.com/",
        },
      },
      {
        id: "41000000-0000-4000-8000-000000000004",
        type: "rsvp",
        visible: true,
        animationPreset: "scale-in",
        props: {
          heading: "Celebrate with us",
          message: "Please respond on or before December 17, 2026.",
          deadline: "2026-12-17T23:59:59+08:00",
        },
      },
    ],
    assets: [],
  },
} as const;
