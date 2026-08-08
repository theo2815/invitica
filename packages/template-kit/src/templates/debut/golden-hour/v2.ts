import { goldenHourTemplate } from "./v1.js";

export const GOLDEN_HOUR_V2_TEMPLATE_VERSION_ID = "40000000-0000-4000-8000-000000000007";

/**
 * Showcase-only image slots. The catalog preview renders every section so a creator can judge the
 * whole template before choosing it, and these assets deliberately resolve to nothing: the renderer
 * falls back to its "pending creator upload" placeholder, which is the honest state of an album
 * nobody has filled in yet. A creator's first draft starts from `starterDocument` instead and
 * references no media at all, because an asset with no uploaded file cannot be published.
 */
const GOLDEN_HOUR_SHOWCASE_PORTRAIT_ASSET_ID = "56000000-0000-4000-8000-000000000001";

const GOLDEN_HOUR_SHOWCASE_GALLERY_ASSET_IDS = [
  "56000000-0000-4000-8000-000000000002",
  "56000000-0000-4000-8000-000000000003",
  "56000000-0000-4000-8000-000000000004",
  "56000000-0000-4000-8000-000000000005",
  "56000000-0000-4000-8000-000000000006",
  "56000000-0000-4000-8000-000000000007",
] as const;

const GOLDEN_HOUR_SHOWCASE_ASSET_IDS = [
  GOLDEN_HOUR_SHOWCASE_PORTRAIT_ASSET_ID,
  ...GOLDEN_HOUR_SHOWCASE_GALLERY_ASSET_IDS,
] as const;

/**
 * The catalog showcase. Every section is visible so a creator judging the template sees the whole
 * program at once, including the album a starter ships hidden.
 */
const goldenHourV2Showcase = {
  schemaVersion: 1,
  templateVersionId: GOLDEN_HOUR_V2_TEMPLATE_VERSION_ID,
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
    recipientMode: "personalized",
    fallbackRecipientText: "Our honored guest",
  },
  sections: [
    {
      id: "52000000-0000-4000-8000-000000000001",
      type: "hero",
      visible: true,
      animationPreset: "scale-in",
      props: {
        eyebrow: "An evening in gold",
        title: "Sam turns XVIII",
        subtitle: "Join us for her milestone entrance and a night shaped by family and friends",
        dateLabel: "Saturday, August 14, 2027",
        imageAssetId: GOLDEN_HOUR_SHOWCASE_PORTRAIT_ASSET_ID,
      },
    },
    {
      id: "52000000-0000-4000-8000-000000000002",
      type: "message",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Eighteen years, one bright beginning",
        body: "With gratitude for every person who helped her grow, our family invites you to celebrate Samantha’s eighteenth birthday.",
        signature: {
          lead: "With love,",
          names: ["Andrea and Marco Villareal"],
        },
      },
    },
    {
      id: "52000000-0000-4000-8000-000000000003",
      type: "countdown",
      visible: true,
      animationPreset: "fade-in",
      props: {
        heading: "Until the doors open",
        target: "2027-08-14T18:00:00+08:00",
        dateLabel: "Saturday, August 14, 2027 at 6:00 PM",
      },
    },
    {
      id: "52000000-0000-4000-8000-000000000004",
      type: "event-details",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "The evening",
        events: [
          {
            label: "Debut celebration",
            startAt: "2027-08-14T18:00:00+08:00",
            dateLabel: "6:00 PM",
            venueName: "The Meridian Ballroom",
            address: "Quezon City, Metro Manila, Philippines",
            mapUrl: "https://maps.google.com/",
            arrivalNote: "Doors open at 5:30 PM. Please be seated before the grand entrance.",
            latitude: 14.6488,
            longitude: 121.0509,
          },
        ],
      },
    },
    {
      id: "52000000-0000-4000-8000-000000000005",
      type: "participants",
      visible: true,
      animationPreset: "stagger-children",
      props: {
        heading: "The people in her eighteen",
        groups: [
          {
            label: "18 roses",
            names: [
              "Marco Villareal",
              "Lucas Reyes",
              "Mateo Cruz",
              "Gabriel Santos",
              "Paolo Lim",
              "Andre Flores",
              "Enzo Garcia",
              "Nico Mendoza",
              "Daniel Yu",
              "Luis Tan",
              "Rafael Co",
              "Miguel Sy",
              "Adrian Ramos",
              "Joaquin de Leon",
              "Carlo Bautista",
              "Theo Navarro",
              "Elijah Castillo",
              "Sebastian Ong",
            ],
          },
          {
            label: "18 candles",
            names: [
              "Andrea Villareal",
              "Alyssa Reyes",
              "Bianca Cruz",
              "Camille Santos",
              "Dani Lim",
              "Elena Flores",
              "Frances Garcia",
              "Gabriela Mendoza",
              "Hannah Yu",
              "Isabel Tan",
              "Julia Co",
              "Kara Sy",
              "Lia Ramos",
              "Mia de Leon",
              "Nina Bautista",
              "Olivia Navarro",
              "Patricia Castillo",
              "Rina Ong",
            ],
          },
          {
            label: "18 treasures",
            names: [
              "Amelia Reyes",
              "Carmen Cruz",
              "Elena Santos",
              "Lourdes Lim",
              "Marissa Flores",
              "Teresa Garcia",
            ],
          },
        ],
      },
    },
    {
      id: "52000000-0000-4000-8000-000000000006",
      type: "schedule",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Program",
        items: [
          { timeLabel: "5:30 PM", title: "Doors open" },
          { timeLabel: "6:00 PM", title: "Grand entrance" },
          { timeLabel: "6:20 PM", title: "Dinner" },
          { timeLabel: "7:30 PM", title: "18 roses" },
          { timeLabel: "8:05 PM", title: "18 candles" },
          { timeLabel: "8:40 PM", title: "18 treasures" },
          { timeLabel: "9:10 PM", title: "A message from Sam" },
          { timeLabel: "9:30 PM", title: "Dancing" },
        ],
      },
    },
    {
      id: "52000000-0000-4000-8000-000000000007",
      type: "attire",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Formal evening attire",
        description:
          "Long dresses, suits, Barong Tagalog, and polished separates are welcome. Please leave white and gold for the debutante.",
        colors: [
          { label: "Aubergine", value: "#4b3148" },
          { label: "Midnight", value: "#211a23" },
          { label: "Dusty rose", value: "#b9878e" },
        ],
      },
    },
    {
      id: "52000000-0000-4000-8000-000000000008",
      type: "gallery",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Eighteen chapters",
        description: "Photographs from the years that led to this evening.",
        images: [
          {
            assetId: GOLDEN_HOUR_SHOWCASE_GALLERY_ASSET_IDS[0],
            title: "Her first recital",
            caption: "Six years old, and unafraid",
          },
          {
            assetId: GOLDEN_HOUR_SHOWCASE_GALLERY_ASSET_IDS[1],
            title: "Summers in Baler",
            caption: "The same shoreline, every April",
          },
          {
            assetId: GOLDEN_HOUR_SHOWCASE_GALLERY_ASSET_IDS[2],
            title: "Sunday lunch",
            caption: "With her lolas, without fail",
          },
          {
            assetId: GOLDEN_HOUR_SHOWCASE_GALLERY_ASSET_IDS[3],
            title: "Team captain",
            caption: "Her last season in the school colors",
          },
          {
            assetId: GOLDEN_HOUR_SHOWCASE_GALLERY_ASSET_IDS[4],
            title: "The gown fitting",
            caption: "Three months of pinning",
          },
          {
            assetId: GOLDEN_HOUR_SHOWCASE_GALLERY_ASSET_IDS[5],
            title: "Seventeen",
            caption: "One more trip around",
          },
        ],
      },
    },
    {
      id: "52000000-0000-4000-8000-000000000009",
      type: "guidance",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "A note for the evening",
        items: [
          "Please arrive before the grand entrance so the program can begin on time.",
          "The ballroom is fully air-conditioned; a light wrap may be useful.",
          "Share your photographs with #SamAtXVIII.",
        ],
      },
    },
    {
      id: "52000000-0000-4000-8000-000000000010",
      type: "rsvp",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Reserve your evening",
        message: "Please respond on your personal invitation by July 24, 2027.",
        deadline: "2027-07-24T23:59:59+08:00",
      },
    },
  ],
  assets: GOLDEN_HOUR_SHOWCASE_ASSET_IDS.map((id) => ({ id, kind: "image" as const })),
} as const;

/**
 * A creator's first draft. Derived from the showcase so the two can never drift in wording, section
 * order, or timing, then stripped back to what a brand-new invitation can honestly publish: no media
 * references, and the album hidden until the family fills it in. Venue coordinates are showcase-only
 * for the same reason the photographs are — they describe the sample debut, not the creator's.
 */
const goldenHourV2StarterSections = goldenHourV2Showcase.sections.map((section) => {
  if (section.type === "hero") {
    const { imageAssetId, ...props } = section.props;
    return { ...section, props };
  }

  if (section.type === "gallery") {
    return { ...section, visible: false, props: { ...section.props, images: [] } };
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

export const goldenHourTemplateV2 = {
  listing: {
    ...goldenHourTemplate.listing,
    date: "August 14, 2027 · Quezon City",
    description:
      "A midnight ballroom program with brass geometry, an XVIII medallion, and space for the traditions and people of a debut.",
  },
  celebrantPronoun: "she",
  editorKey: "section-document-v1",
  templateVersionId: GOLDEN_HOUR_V2_TEMPLATE_VERSION_ID,
  supersedesTemplateVersionId: goldenHourTemplate.templateVersionId,
  version: 2,
  qualityStatus: "production",
  rendererKey: "golden-hour-v2",
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
    "rsvp",
  ],
  defaultDocument: goldenHourV2Showcase,
  starterDocument: {
    ...goldenHourV2Showcase,
    sections: goldenHourV2StarterSections,
    assets: [],
  },
} as const;
