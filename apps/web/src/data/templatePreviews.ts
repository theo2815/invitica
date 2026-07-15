export const templatePreviews = [
  {
    id: "garden-promise",
    occasion: "Wedding",
    name: "Garden Promise",
    previewTitle: "Mara & Joaquin",
    date: "January 17, 2027 · Manila",
    tier: "Free",
    style: "Romantic botanical",
    description:
      "A quiet garden composition with sage paper, fine borders, and generous space for a personal story.",
    sections: ["Opening", "Event details", "Story", "Venue", "RSVP"],
  },
  {
    id: "golden-hour",
    occasion: "Debut",
    name: "Golden Hour",
    previewTitle: "Sam turns XVIII",
    date: "August 14, 2027 · Quezon City",
    tier: "Premium",
    style: "Art deco evening",
    description:
      "A confident evening design with geometric framing and warm metallic-inspired accents for a milestone entrance.",
    sections: ["Opening", "Event details", "Program", "Dress code", "Gallery", "RSVP"],
  },
  {
    id: "sunday-joy",
    occasion: "Birthday",
    name: "Sunday Joy",
    previewTitle: "Lia is seven!",
    date: "May 9, 2027 · Pasig",
    tier: "Free",
    style: "Playful celebration",
    description:
      "A bright, friendly composition with cheerful color, simple event details, and room for favorite photographs.",
    sections: ["Opening", "Event details", "Gallery", "Venue", "RSVP"],
  },
] as const;

export type TemplatePreview = (typeof templatePreviews)[number];
