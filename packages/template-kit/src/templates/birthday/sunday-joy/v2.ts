import { sundayJoyTemplate } from "./v1.js";

export const SUNDAY_JOY_V2_TEMPLATE_VERSION_ID = "40000000-0000-4000-8000-000000000008";

export const sundayJoyTemplateV2 = {
  listing: {
    ...sundayJoyTemplate.listing,
    date: "May 9, 2027 · Pasig",
    description:
      "A sunlit cut-paper party book with scalloped edges, a playful activity trail, and practical notes for children and grown-ups.",
  },
  celebrantPronoun: "she",
  editorKey: "section-document-v1",
  templateVersionId: SUNDAY_JOY_V2_TEMPLATE_VERSION_ID,
  supersedesTemplateVersionId: sundayJoyTemplate.templateVersionId,
  version: 2,
  qualityStatus: "production",
  rendererKey: "sunday-joy-v2",
  schemaVersion: 1,
  allowedSections: [
    "hero",
    "message",
    "countdown",
    "event-details",
    "schedule",
    "attire",
    "gallery",
    "guidance",
    "gifts",
    "rsvp",
  ],
  defaultDocument: {
    schemaVersion: 1,
    templateVersionId: SUNDAY_JOY_V2_TEMPLATE_VERSION_ID,
    locale: "en-PH",
    eventTimezone: "Asia/Manila",
    theme: {
      colors: {
        background: "#fff2bd",
        surface: "#fffaf0",
        text: "#582f35",
        accent: "#a84f43",
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
        id: "53000000-0000-4000-8000-000000000001",
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
        id: "53000000-0000-4000-8000-000000000002",
        type: "message",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Come play with us",
          body: "Bring your biggest smile for an afternoon of games, merienda, music, and a very colorful birthday cake.",
          signature: {
            lead: "With love from,",
            names: ["Lia’s family"],
          },
        },
      },
      {
        id: "53000000-0000-4000-8000-000000000003",
        type: "countdown",
        visible: true,
        animationPreset: "fade-in",
        props: {
          heading: "The party starts in",
          target: "2027-05-09T14:00:00+08:00",
          dateLabel: "Sunday, May 9, 2027 at 2:00 PM",
        },
      },
      {
        id: "53000000-0000-4000-8000-000000000004",
        type: "event-details",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Party place",
          events: [
            {
              label: "Birthday celebration",
              startAt: "2027-05-09T14:00:00+08:00",
              dateLabel: "2:00 PM to 5:00 PM",
              venueName: "Sunroom Celebration Hall",
              address: "Pasig City, Metro Manila, Philippines",
              mapUrl: "https://maps.google.com/",
              arrivalNote: "The play area opens at 1:45 PM. Socks are required for children.",
            },
          ],
        },
      },
      {
        id: "53000000-0000-4000-8000-000000000005",
        type: "schedule",
        visible: false,
        animationPreset: "fade-up",
        props: {
          heading: "Party trail",
          items: [
            { timeLabel: "2:00 PM", title: "Welcome games" },
            { timeLabel: "3:00 PM", title: "Merienda" },
            { timeLabel: "4:00 PM", title: "Cake and birthday song" },
          ],
        },
      },
      {
        id: "53000000-0000-4000-8000-000000000006",
        type: "attire",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Ready to play",
          description:
            "Come in bright, comfortable clothes made for moving. Children should bring socks for the indoor play area.",
          colors: [
            { label: "Sunshine", value: "#f6c94c" },
            { label: "Coral", value: "#dd654c" },
            { label: "Sky blue", value: "#79b9d4" },
          ],
        },
      },
      {
        id: "53000000-0000-4000-8000-000000000007",
        type: "gallery",
        visible: false,
        animationPreset: "fade-up",
        props: {
          heading: "Favorite little moments",
          description: "A colorful collection from the year so far.",
          images: [],
        },
      },
      {
        id: "53000000-0000-4000-8000-000000000008",
        type: "guidance",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "A note for grown-ups",
          items: [
            "A parent or guardian should stay with each child during the party.",
            "Please tell us about allergies in your RSVP message.",
            "The venue has a quiet corner for children who need a break.",
          ],
        },
      },
      {
        id: "53000000-0000-4000-8000-000000000009",
        type: "gifts",
        visible: false,
        animationPreset: "fade-up",
        props: {
          heading: "No gifts needed",
          message:
            "Your company is plenty. If your child would like to bring something, Lia would love a drawing for her party book.",
          items: [{ name: "A drawing or little note", note: "For Lia’s party book" }],
        },
      },
      {
        id: "53000000-0000-4000-8000-000000000010",
        type: "rsvp",
        visible: true,
        animationPreset: "scale-in",
        props: {
          heading: "Save your party hat",
          message: "Please respond on your personal invitation by April 25, 2027.",
          deadline: "2027-04-25T23:59:59+08:00",
        },
      },
    ],
    assets: [],
  },
} as const;
