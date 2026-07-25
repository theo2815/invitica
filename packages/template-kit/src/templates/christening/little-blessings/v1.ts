export const littleBlessingsTemplate = {
  listing: {
    id: "little-blessings",
    occasion: "Christening",
    name: "Little Blessings",
    previewTitle: "Eliana's little blessing",
    date: "April 11, 2027 - Quezon City",
    tier: "Free",
    style: "Soft sacred editorial",
    description:
      "A warm, broadly Christian celebration with space for baby photographs, ceremony details, loved ones, and practical gift ideas.",
  },
  templateVersionId: "40000000-0000-4000-8000-000000000004",
  version: 1,
  qualityStatus: "fixture",
  rendererKey: "little-blessings-v1",
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
  defaultDocument: {
    schemaVersion: 1,
    templateVersionId: "40000000-0000-4000-8000-000000000004",
    locale: "en-PH",
    eventTimezone: "Asia/Manila",
    theme: {
      colors: {
        background: "#f9e5eb",
        surface: "#fffbfc",
        text: "#463640",
        accent: "#dd7f9b",
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
        id: "44000000-0000-4000-8000-000000000001",
        type: "hero",
        visible: true,
        animationPreset: "fade-in",
        props: {
          eyebrow: "A little blessing to celebrate",
          title: "Eliana Grace",
          subtitle: "Join us as we welcome her with faith, love, and grateful hearts",
          dateLabel: "Sunday, April 11, 2027",
          imageAssetId: "45000000-0000-4000-8000-000000000001",
        },
      },
      {
        id: "44000000-0000-4000-8000-000000000002",
        type: "message",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Held in grace",
          body: "With joyful hearts, we invite you to share a day of prayer, family, and thanksgiving for our little blessing.",
          signature: {
            lead: "With love, her parents",
            names: ["Mika Reyes", "Daniel Reyes"],
          },
        },
      },
      {
        id: "44000000-0000-4000-8000-000000000003",
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
        id: "44000000-0000-4000-8000-000000000004",
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
              address: "Quezon City, Metro Manila, Philippines",
              mapUrl: "https://maps.google.com/",
              latitude: 14.6507,
              longitude: 121.0494,
              arrivalNote: "Please arrive 20 minutes early so everyone can be seated together.",
            },
            {
              label: "Family reception",
              startAt: "2027-04-11T11:00:00+08:00",
              dateLabel: "11:00 AM",
              venueName: "The Sunlit Hall",
              address: "Quezon City, Metro Manila, Philippines",
              mapUrl: "https://maps.google.com/",
              latitude: 14.676,
              longitude: 121.0437,
              arrivalNote: "Parking and step-free entry are available at the reception venue.",
            },
          ],
        },
      },
      {
        id: "44000000-0000-4000-8000-000000000005",
        type: "participants",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Our ninong and ninang",
          groups: [
            { label: "Tito", names: ["Paolo Cruz", "Gabriel Flores"] },
            { label: "Tita", names: ["Alyssa Cruz", "Nina Flores"] },
          ],
        },
      },
      {
        id: "44000000-0000-4000-8000-000000000006",
        type: "schedule",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Order of the day",
          items: [
            { timeLabel: "8:40 AM", title: "Guests arrive" },
            { timeLabel: "9:00 AM", title: "Christening ceremony" },
            { timeLabel: "10:00 AM", title: "Family photographs" },
            { timeLabel: "11:00 AM", title: "Reception and lunch" },
          ],
        },
      },
      {
        id: "44000000-0000-4000-8000-000000000008",
        type: "attire",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "What to wear",
          description:
            "Sunday best in light, comfortable colors. The ceremony and reception are both family friendly.",
          colors: [
            { label: "Blush pink", value: "#f6dce0" },
            { label: "Pearl white", value: "#fffbfc" },
            { label: "Soft rose", value: "#dd7f9b" },
          ],
          groups: [
            {
              label: "Ninong and ninang",
              description:
                "Barong Tagalog for the titos, and a formal dress in pearl or blush for the titas.",
              colors: [
                { label: "Pearl white", value: "#fffbfc" },
                { label: "Blush pink", value: "#f6dce0" },
              ],
            },
            {
              label: "Our guests",
              description:
                "Smart casual in any soft, light color. Comfortable shoes are a kindness at both venues.",
            },
          ],
        },
      },
      {
        id: "44000000-0000-4000-8000-000000000009",
        type: "gallery",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Little moments",
          description: "A few of the quiet days that brought us to this one.",
          images: [
            {
              assetId: "45000000-0000-4000-8000-000000000002",
              title: "Eliana resting in a light blanket",
              caption: "Our first quiet afternoon together",
            },
            {
              assetId: "45000000-0000-4000-8000-000000000003",
              title: "Eliana smiling during family time",
              caption: "A smile that brightens the room",
            },
            {
              assetId: "45000000-0000-4000-8000-000000000004",
              title: "Eliana held safely by her parents",
              caption: "Surrounded by love",
            },
            {
              assetId: "45000000-0000-4000-8000-000000000005",
              title: "Eliana wearing a simple white outfit",
              caption: "Ready for a day of blessings",
            },
            {
              assetId: "45000000-0000-4000-8000-000000000006",
              title: "Eliana asleep against her mother's shoulder",
            },
            {
              assetId: "45000000-0000-4000-8000-000000000007",
              title: "Eliana reaching for her father's hand",
              caption: "Learning to hold on",
            },
            {
              assetId: "45000000-0000-4000-8000-000000000008",
              caption: "A morning in the garden",
            },
            {
              assetId: "45000000-0000-4000-8000-000000000009",
            },
          ],
        },
      },
      {
        id: "44000000-0000-4000-8000-000000000010",
        type: "guidance",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "A gentle note",
          items: [
            "Please arrive early and keep phones silent during the ceremony.",
            "Kindly ask the parents before holding or kissing the baby.",
            "Please ask the family before posting photographs online.",
          ],
        },
      },
      {
        id: "44000000-0000-4000-8000-000000000011",
        type: "gifts",
        visible: true,
        animationPreset: "fade-up",
        props: {
          heading: "Gift ideas",
          message:
            "Your presence and prayers are enough. If you would like to bring something, these ideas would be lovingly received.",
          items: [
            {
              imageAssetId: "45000000-0000-4000-8000-000000000010",
              name: "Board books",
              note: "Stories the family can enjoy together",
            },
            {
              imageAssetId: "45000000-0000-4000-8000-000000000011",
              name: "Clothing for 6 to 12 months",
              note: "Soft, practical pieces for the months ahead",
            },
            {
              imageAssetId: "45000000-0000-4000-8000-000000000012",
              name: "Gentle bath essentials",
              note: "Unscented and baby-safe options are preferred",
            },
            {
              imageAssetId: "45000000-0000-4000-8000-000000000013",
              name: "A keepsake blanket",
              note: "Something soft she can grow up with",
            },
            {
              imageAssetId: "45000000-0000-4000-8000-000000000014",
              name: "Wooden toys",
              note: "Simple shapes and quiet colors",
            },
            {
              imageAssetId: "45000000-0000-4000-8000-000000000015",
              name: "A savings gift for her education",
            },
            {
              name: "Nappies in size two and above",
              note: "Always useful, and never too many",
            },
            {
              name: "A written blessing for her keepsake book",
            },
          ],
        },
      },
      {
        id: "44000000-0000-4000-8000-000000000007",
        type: "rsvp",
        visible: true,
        animationPreset: "scale-in",
        props: {
          heading: "Celebrate with us",
          message: "Please let us know by March 28 if your party can join us.",
          deadline: "2027-03-28T23:59:59+08:00",
        },
      },
    ],
    assets: [
      { id: "45000000-0000-4000-8000-000000000001", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000002", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000003", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000004", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000005", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000006", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000007", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000008", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000009", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000010", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000011", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000012", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000013", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000014", kind: "image" },
      { id: "45000000-0000-4000-8000-000000000015", kind: "image" },
    ],
  },
} as const;
