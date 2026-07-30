import { gardenPromiseTemplate } from "./v1.js";

export const GARDEN_PROMISE_V2_TEMPLATE_VERSION_ID = "40000000-0000-4000-8000-000000000006";

/**
 * Showcase-only image slots. The catalog preview renders every section so a creator can judge the
 * whole template before choosing it, and these assets deliberately resolve to nothing: the renderer
 * falls back to its "pending creator upload" placeholder, which is the honest state of an album
 * nobody has filled in yet. A creator's first draft starts from `starterDocument` instead and
 * references no media at all, because an asset with no uploaded file cannot be published.
 */
const GARDEN_PROMISE_SHOWCASE_GALLERY_ASSET_IDS = [
  "52000000-0000-4000-8000-000000000001",
  "52000000-0000-4000-8000-000000000002",
  "52000000-0000-4000-8000-000000000003",
  "52000000-0000-4000-8000-000000000004",
] as const;

const GARDEN_PROMISE_SHOWCASE_PORTRAIT_ASSET_ID = "52000000-0000-4000-8000-000000000005";

const GARDEN_PROMISE_SHOWCASE_GIFT_ASSET_IDS = [
  "52000000-0000-4000-8000-000000000006",
  "52000000-0000-4000-8000-000000000007",
  "52000000-0000-4000-8000-000000000008",
] as const;

const GARDEN_PROMISE_SHOWCASE_ASSET_IDS = [
  ...GARDEN_PROMISE_SHOWCASE_GALLERY_ASSET_IDS,
  GARDEN_PROMISE_SHOWCASE_PORTRAIT_ASSET_ID,
  ...GARDEN_PROMISE_SHOWCASE_GIFT_ASSET_IDS,
] as const;

/**
 * The catalog showcase. Every section is visible so a creator judging the template sees the whole
 * thing at once, including the album and gift list a starter ships hidden.
 */
const gardenPromiseV2Showcase = {
  schemaVersion: 1,
  templateVersionId: GARDEN_PROMISE_V2_TEMPLATE_VERSION_ID,
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
      id: "51000000-0000-4000-8000-000000000001",
      type: "hero",
      visible: true,
      animationPreset: "fade-in",
      props: {
        eyebrow: "Together with their families",
        title: "Mara & Joaquin",
        subtitle: "Invite you to witness their vows and share the table that follows",
        dateLabel: "Sunday, January 17, 2027",
        imageAssetId: GARDEN_PROMISE_SHOWCASE_PORTRAIT_ASSET_ID,
      },
    },
    {
      id: "51000000-0000-4000-8000-000000000002",
      type: "message",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "A promise in the garden",
        body: "The people we love have shaped every season of our story. We hope you will join us as we begin the next one together.",
        signature: {
          lead: "With love,",
          names: ["Mara Villanueva", "Joaquin Santos"],
        },
      },
    },
    {
      id: "51000000-0000-4000-8000-000000000003",
      type: "countdown",
      visible: true,
      animationPreset: "fade-in",
      props: {
        heading: "Until we say yes",
        target: "2027-01-17T15:00:00+08:00",
        dateLabel: "Sunday, January 17, 2027 at 3:00 PM",
      },
    },
    {
      id: "51000000-0000-4000-8000-000000000004",
      type: "event-details",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "The day, in two places",
        events: [
          {
            label: "Wedding ceremony",
            startAt: "2027-01-17T15:00:00+08:00",
            dateLabel: "3:00 PM",
            venueName: "Nuestra Señora Garden Chapel",
            address: "Silang, Cavite, Philippines",
            mapUrl: "https://maps.google.com/",
            arrivalNote:
              "Please be seated by 2:40 PM. The garden path is a short walk from parking.",
            latitude: 14.2265,
            longitude: 120.9702,
          },
          {
            label: "Dinner reception",
            startAt: "2027-01-17T17:00:00+08:00",
            dateLabel: "5:00 PM",
            venueName: "Hiraya Garden Pavilion",
            address: "Silang, Cavite, Philippines",
            mapUrl: "https://maps.google.com/",
            arrivalNote: "Cocktails begin on the terrace after the ceremony.",
            latitude: 14.2331,
            longitude: 120.9786,
          },
        ],
      },
    },
    {
      id: "51000000-0000-4000-8000-000000000005",
      type: "participants",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "With the people who raised and guided us",
        groups: [
          {
            label: "Parents of the bride",
            names: ["Teresa Villanueva", "Ramon Villanueva"],
          },
          {
            label: "Parents of the groom",
            names: ["Lucia Santos", "Eduardo Santos"],
          },
          {
            label: "Principal sponsors",
            names: [
              "Amelia Cruz",
              "Roberto Cruz",
              "Carmen Reyes",
              "Felipe Reyes",
              "Elena Lim",
              "Victor Lim",
            ],
          },
          {
            label: "Maid of honor and best man",
            names: ["Isabel Villanueva", "Miguel Santos"],
          },
          {
            label: "Veil sponsors",
            names: ["Camille Flores", "Paolo Flores"],
          },
          {
            label: "Cord sponsors",
            names: ["Nina Garcia", "Andre Garcia"],
          },
          {
            label: "Candle sponsors",
            names: ["Sofia Mendoza", "Luis Mendoza"],
          },
          {
            label: "Bridesmaids",
            names: ["Ana de Leon", "Bianca Ramos", "Clara Yu"],
          },
          {
            label: "Groomsmen",
            names: ["Daniel Co", "Enzo Tan", "Gabriel Sy"],
          },
          {
            label: "Bearers and flower girls",
            names: ["Nico Reyes", "Mia Cruz", "Luna Flores"],
          },
        ],
      },
    },
    {
      id: "51000000-0000-4000-8000-000000000006",
      type: "schedule",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Order of the day",
        items: [
          { timeLabel: "2:30 PM", title: "Guest arrival" },
          { timeLabel: "3:00 PM", title: "Wedding ceremony" },
          { timeLabel: "4:10 PM", title: "Family photographs" },
          { timeLabel: "5:00 PM", title: "Cocktails on the terrace" },
          { timeLabel: "6:00 PM", title: "Dinner and toasts" },
          { timeLabel: "8:00 PM", title: "Dancing under the lights" },
        ],
      },
    },
    {
      id: "51000000-0000-4000-8000-000000000007",
      type: "attire",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Garden formal",
        description:
          "Light suits, long dresses, and polished separates are welcome. Please choose shoes comfortable on garden paths.",
        colors: [
          { label: "Sage", value: "#87927a" },
          { label: "Warm ivory", value: "#fff8e8" },
          { label: "Clay rose", value: "#b77a72" },
        ],
      },
    },
    {
      id: "51000000-0000-4000-8000-000000000008",
      type: "gallery",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Our story in photographs",
        description: "A few moments from the seasons that brought us here.",
        images: [
          {
            assetId: GARDEN_PROMISE_SHOWCASE_GALLERY_ASSET_IDS[0],
            title: "The proposal",
            caption: "Tagaytay ridge, the morning it rained",
          },
          {
            assetId: GARDEN_PROMISE_SHOWCASE_GALLERY_ASSET_IDS[1],
            title: "Meeting the families",
            caption: "One long table, in Silang",
          },
          {
            assetId: GARDEN_PROMISE_SHOWCASE_GALLERY_ASSET_IDS[2],
            title: "The chapel garden",
            caption: "Where we will say yes",
          },
          {
            assetId: GARDEN_PROMISE_SHOWCASE_GALLERY_ASSET_IDS[3],
            title: "Everyday Sundays",
            caption: "Market runs and slow mornings",
          },
        ],
      },
    },
    {
      id: "51000000-0000-4000-8000-000000000009",
      type: "guidance",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Before you travel",
        items: [
          "The ceremony and reception are five minutes apart by car.",
          "Please allow extra travel time for Sunday traffic toward Silang.",
          "Share your photographs with #MaraAndJoaquinInBloom.",
        ],
      },
    },
    {
      id: "51000000-0000-4000-8000-000000000010",
      type: "gifts",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "A note about gifts",
        message:
          "Your presence is the gift we hope for. If you would still like to give, a contribution toward our first home would be received with gratitude.",
        items: [
          {
            name: "A handwritten wish",
            note: "For our keepsake box",
            imageAssetId: GARDEN_PROMISE_SHOWCASE_GIFT_ASSET_IDS[0],
          },
          {
            name: "Something for the garden",
            note: "Cuttings, seeds, or a pot we can plant",
            imageAssetId: GARDEN_PROMISE_SHOWCASE_GIFT_ASSET_IDS[1],
          },
          {
            name: "Toward our first home",
            note: "A contribution to the kitchen we are saving for",
            imageAssetId: GARDEN_PROMISE_SHOWCASE_GIFT_ASSET_IDS[2],
          },
        ],
      },
    },
    {
      id: "51000000-0000-4000-8000-000000000011",
      type: "rsvp",
      visible: true,
      animationPreset: "scale-in",
      props: {
        heading: "Will you join us?",
        message: "Please respond on your personal invitation by December 17, 2026.",
        deadline: "2026-12-17T23:59:59+08:00",
      },
    },
  ],
  assets: GARDEN_PROMISE_SHOWCASE_ASSET_IDS.map((id) => ({ id, kind: "image" as const })),
} as const;

/**
 * A creator's first draft. Derived from the showcase so the two can never drift in wording, section
 * order, or timing, then stripped back to what a brand-new invitation can honestly publish: no media
 * references, and the album and gift list hidden until the couple fills them in. Venue coordinates
 * are showcase-only for the same reason the photographs are — they describe the sample wedding, not
 * the creator's.
 */
const gardenPromiseV2StarterSections = gardenPromiseV2Showcase.sections.map((section) => {
  if (section.type === "hero") {
    const { imageAssetId, ...props } = section.props;
    return { ...section, props };
  }

  if (section.type === "gallery") {
    return { ...section, visible: false, props: { ...section.props, images: [] } };
  }

  if (section.type === "gifts") {
    return {
      ...section,
      visible: false,
      props: {
        ...section.props,
        items: section.props.items.slice(0, 1).map(({ imageAssetId, ...item }) => item),
      },
    };
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

  return section;
});

export const gardenPromiseTemplateV2 = {
  listing: {
    ...gardenPromiseTemplate.listing,
    date: "January 17, 2027 · Silang",
    description:
      "A pressed garden folio with paired ceremony and reception details, an entourage roll, and room for every part of the day.",
  },
  celebrantPronoun: "they",
  editorKey: "section-document-v1",
  templateVersionId: GARDEN_PROMISE_V2_TEMPLATE_VERSION_ID,
  supersedesTemplateVersionId: gardenPromiseTemplate.templateVersionId,
  version: 2,
  qualityStatus: "production",
  rendererKey: "garden-promise-v2",
  schemaVersion: 1,
  allowedSections: [
    "hero",
    "message",
    "countdown",
    "event-details",
    "participants",
    "schedule",
    "attire",
    "gallery",
    "guidance",
    "gifts",
    "rsvp",
  ],
  defaultDocument: gardenPromiseV2Showcase,
  starterDocument: {
    ...gardenPromiseV2Showcase,
    sections: gardenPromiseV2StarterSections,
    assets: [],
  },
} as const;
