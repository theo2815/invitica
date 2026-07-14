import type { InvitationDocument } from "./document.js";

export const invitationFixture: InvitationDocument = {
  schemaVersion: 1,
  templateVersionId: "10000000-0000-4000-8000-000000000001",
  locale: "en-PH",
  eventTimezone: "Asia/Manila",
  theme: {
    colors: {
      background: "#f8f3eb",
      surface: "#fffdf9",
      text: "#2d241f",
      accent: "#8d5b4c",
      accentContrast: "#ffffff",
    },
    typography: {
      headingFontId: "playfair-display",
      bodyFontId: "inter",
    },
    spacingScale: "comfortable",
  },
  opening: {
    preset: "ribbon-envelope-letter",
    motionStyle: "elegant",
    recipientMode: "personalized",
    fallbackRecipientText: "Our dear guest",
  },
  sections: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      type: "hero",
      visible: true,
      animationPreset: "fade-in",
      props: {
        eyebrow: "Together with their families",
        title: "Theo & Maria",
        subtitle: "Invite you to celebrate their wedding",
        dateLabel: "December 12, 2026",
      },
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      type: "message",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "A new chapter",
        body: "We would be honored to celebrate this day with you.",
      },
    },
    {
      id: "20000000-0000-4000-8000-000000000003",
      type: "venue",
      visible: true,
      animationPreset: "fade-up",
      props: {
        heading: "Venue",
        venueName: "The Glass Garden",
        address: "Pasig City, Metro Manila",
        mapUrl: "https://maps.google.com/",
      },
    },
    {
      id: "20000000-0000-4000-8000-000000000004",
      type: "rsvp",
      visible: true,
      animationPreset: "scale-in",
      props: {
        heading: "Will you join us?",
        message: "Please respond on or before November 12, 2026.",
        deadline: "2026-11-12T23:59:59+08:00",
      },
    },
  ],
  assets: [],
};
