export const goldenHourTemplate = {
  listing: {
    id: "golden-hour",
    occasion: "Debut",
    name: "Golden Hour",
    previewTitle: "Sam turns XVIII",
    date: "August 14, 2027 · Quezon City",
    tier: "Premium",
    style: "Art deco evening",
    description:
      "A confident evening design with geometric framing and warm metallic-inspired accents for a milestone entrance.",
  },
  // A debut is traditionally a young woman's eighteenth birthday.
  celebrantPronoun: "she",
  templateVersionId: "40000000-0000-4000-8000-000000000002",
  version: 1,
  qualityStatus: "fixture",
  rendererKey: "standard-v1",
  schemaVersion: 1,
  allowedSections: ["hero", "venue", "message", "rsvp"],
  defaultDocument: {
    schemaVersion: 1,
    templateVersionId: "40000000-0000-4000-8000-000000000002",
    locale: "en-PH",
    eventTimezone: "Asia/Manila",
    theme: {
      colors: {
        background: "#211a23",
        surface: "#302631",
        text: "#f8edda",
        accent: "#d3ad60",
        accentContrast: "#211a23",
      },
      typography: {
        headingFontId: "fraunces",
        bodyFontId: "instrument-sans",
      },
      spacingScale: "comfortable",
    },
    opening: {
      preset: "ribbon-envelope-letter",
      motionStyle: "cinematic",
      recipientMode: "generic",
      fallbackRecipientText: "Honored guest",
    },
    sections: [
      {
        id: "42000000-0000-4000-8000-000000000001",
        type: "hero",
        visible: true,
        animationPreset: "scale-in",
        props: {
          eyebrow: "An evening in gold",
          title: "Sam turns XVIII",
          subtitle: "Join us for a milestone entrance and a night of celebration",
          dateLabel: "Saturday, August 14, 2027",
        },
      },
      {
        id: "42000000-0000-4000-8000-000000000002",
        type: "venue",
        visible: true,
        animationPreset: "fade-in",
        props: {
          heading: "Doors open at six",
          venueName: "The Meridian Ballroom",
          address: "Quezon City, Metro Manila, Philippines",
          mapUrl: "https://maps.google.com/",
        },
      },
      {
        id: "42000000-0000-4000-8000-000000000003",
        type: "message",
        visible: true,
        animationPreset: "stagger-children",
        props: {
          heading: "A night to remember",
          body: "Come dressed for an elegant evening as we celebrate eighteen years, cherished traditions, and the adventures ahead.",
        },
      },
      {
        id: "42000000-0000-4000-8000-000000000004",
        type: "rsvp",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Reserve your evening",
          message: "Kindly respond by July 24, 2027.",
          deadline: "2027-07-24T23:59:59+08:00",
        },
      },
    ],
    assets: [],
  },
} as const;
