export const sundayJoyTemplate = {
  listing: {
    id: "sunday-joy",
    occasion: "Birthday",
    name: "Sunday Joy",
    previewTitle: "Lia is seven!",
    date: "May 9, 2027 · Pasig",
    tier: "Free",
    style: "Playful celebration",
    description:
      "A bright, friendly composition with cheerful color, simple event details, and room for favorite photographs.",
  },
  celebrantPronoun: "she",
  templateVersionId: "40000000-0000-4000-8000-000000000003",
  version: 1,
  qualityStatus: "fixture",
  rendererKey: "standard-v1",
  schemaVersion: 1,
  allowedSections: ["hero", "rsvp", "message", "venue"],
  defaultDocument: {
    schemaVersion: 1,
    templateVersionId: "40000000-0000-4000-8000-000000000003",
    locale: "en-PH",
    eventTimezone: "Asia/Manila",
    theme: {
      colors: {
        background: "#fff2bd",
        surface: "#fffaf0",
        text: "#582f35",
        accent: "#dd654c",
        accentContrast: "#ffffff",
      },
      typography: {
        headingFontId: "fraunces",
        bodyFontId: "instrument-sans",
      },
      spacingScale: "comfortable",
    },
    opening: {
      preset: "ribbon-envelope-letter",
      motionStyle: "playful",
      recipientMode: "personalized",
      fallbackRecipientText: "Our favorite party guest",
    },
    sections: [
      {
        id: "43000000-0000-4000-8000-000000000001",
        type: "hero",
        visible: true,
        animationPreset: "stagger-children",
        props: {
          eyebrow: "Cake, games, and big smiles",
          title: "Lia is seven!",
          subtitle: "A bright Sunday party for our favorite little adventurer",
          dateLabel: "Sunday, May 9, 2027",
        },
      },
      {
        id: "43000000-0000-4000-8000-000000000002",
        type: "rsvp",
        visible: true,
        animationPreset: "scale-in",
        props: {
          heading: "Save your party hat",
          message: "Let us know by April 25 if you can celebrate with us.",
          deadline: "2027-04-25T23:59:59+08:00",
        },
      },
      {
        id: "43000000-0000-4000-8000-000000000003",
        type: "message",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Sunday fun",
          body: "Bring your biggest smile for an afternoon of games, merienda, music, and a very colorful birthday cake.",
        },
      },
      {
        id: "43000000-0000-4000-8000-000000000004",
        type: "venue",
        visible: true,
        animationPreset: "fade-in",
        props: {
          heading: "Party place",
          venueName: "Sunroom Celebration Hall",
          address: "Pasig City, Metro Manila, Philippines",
          mapUrl: "https://maps.google.com/",
        },
      },
    ],
    assets: [],
  },
} as const;
