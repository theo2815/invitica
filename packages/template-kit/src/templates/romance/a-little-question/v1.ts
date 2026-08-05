export const A_LITTLE_QUESTION_TEMPLATE_VERSION_ID = "40000000-0000-4000-8000-000000000009";

const SHOWCASE_PORTRAIT_ASSET_ID = "59000000-0000-4000-8000-000000000001";
const SHOWCASE_GALLERY_ASSET_IDS = [
  "59000000-0000-4000-8000-000000000002",
  "59000000-0000-4000-8000-000000000003",
  "59000000-0000-4000-8000-000000000004",
] as const;

const showcase = {
  schemaVersion: 1,
  templateVersionId: A_LITTLE_QUESTION_TEMPLATE_VERSION_ID,
  locale: "en-PH",
  eventTimezone: "Asia/Manila",
  theme: {
    colors: {
      background: "#f6e7e8",
      surface: "#fffaf7",
      text: "#4b2c34",
      accent: "#b34d65",
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
    fallbackRecipientText: "Someone very special",
  },
  sections: [
    {
      id: "58000000-0000-4000-8000-000000000001",
      type: "hero",
      visible: true,
      animationPreset: "fade-up",
      props: {
        eyebrow: "For Mia",
        title: "A little question",
        subtitle: "There is something I have been hoping to ask you.",
        dateLabel: "Just us, soon",
        imageAssetId: SHOWCASE_PORTRAIT_ASSET_ID,
      },
    },
    {
      id: "58000000-0000-4000-8000-000000000002",
      type: "message",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Why I am asking",
        body: "Every ordinary day feels better with you in it. I would love one evening with nowhere else to be and no one else I would rather see.",
        signature: {
          lead: "With love,",
          names: ["Noah"],
        },
      },
    },
    {
      id: "58000000-0000-4000-8000-000000000003",
      type: "event-details",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "If you say yes",
        events: [
          {
            label: "Dinner for two",
            startAt: "2027-02-14T18:30:00+08:00",
            dateLabel: "Sunday, February 14 at 6:30 PM",
            venueName: "The Glass Garden",
            address: "Makati City, Metro Manila, Philippines",
            mapUrl: "https://maps.google.com/",
            arrivalNote: "I will take care of the plan. Just bring yourself.",
            latitude: 14.5547,
            longitude: 121.0244,
          },
        ],
      },
    },
    {
      id: "58000000-0000-4000-8000-000000000004",
      type: "gallery",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "A few favorite moments",
        description: "The small memories I keep returning to.",
        images: [
          {
            assetId: SHOWCASE_GALLERY_ASSET_IDS[0],
            title: "Our first coffee",
            caption: "The conversation that ran past closing time",
          },
          {
            assetId: SHOWCASE_GALLERY_ASSET_IDS[1],
            title: "A rainy walk",
            caption: "One umbrella, barely",
          },
          {
            assetId: SHOWCASE_GALLERY_ASSET_IDS[2],
            title: "That sunset",
            caption: "The one we did not want to leave",
          },
        ],
      },
    },
    {
      id: "58000000-0000-4000-8000-000000000005",
      type: "rsvp",
      visible: true,
      animationPreset: "scale-in",
      props: {
        heading: "Will you go on a date with me?",
        message: "I would love to spend this evening with you.",
        responseMode: "romantic-question",
        declineButtonBehavior: "dodge-five",
      },
    },
  ],
  assets: [SHOWCASE_PORTRAIT_ASSET_ID, ...SHOWCASE_GALLERY_ASSET_IDS].map((id) => ({
    id,
    kind: "image" as const,
  })),
} as const;

const starterSections = showcase.sections.map((section) => {
  if (section.type === "hero") {
    const { imageAssetId, ...props } = section.props;
    return { ...section, props };
  }

  if (section.type === "event-details") {
    return {
      ...section,
      props: {
        ...section.props,
        events: section.props.events.map(({ latitude, longitude, ...event }) => event),
      },
    };
  }

  if (section.type === "gallery") {
    return { ...section, visible: false, props: { ...section.props, images: [] } };
  }

  return section;
});

export const aLittleQuestionTemplate = {
  listing: {
    id: "a-little-question",
    occasion: "Romance",
    name: "A Little Question",
    previewTitle: "Will you go on a date with me?",
    date: "February 14, 2027 · Makati",
    tier: "Free",
    style: "Playful love note",
    description:
      "A personal love note that builds toward one question, with an optional five-move No button and a private answer.",
  },
  celebrantPronoun: "they",
  editorKey: "section-document-v1",
  templateVersionId: A_LITTLE_QUESTION_TEMPLATE_VERSION_ID,
  version: 1,
  qualityStatus: "production",
  rendererKey: "little-question-v1",
  schemaVersion: 1,
  allowedSections: ["hero", "message", "event-details", "gallery", "rsvp"],
  defaultDocument: showcase,
  starterDocument: {
    ...showcase,
    sections: starterSections,
    assets: [],
  },
} as const;
