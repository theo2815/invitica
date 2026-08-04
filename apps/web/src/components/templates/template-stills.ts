const templateStillSources: Readonly<Record<string, string>> = {
  "garden-promise": "/landing/templates/garden-promise-svg-20260804.jpg",
  "golden-hour": "/landing/templates/golden-hour-svg-20260804.jpg",
  "sunday-joy": "/landing/templates/sunday-joy-svg-20260804.jpg",
  "little-blessings": "/landing/templates/little-blessings-svg-20260804.jpg",
};

export function templateStillSource(templateId: string) {
  return templateStillSources[templateId] ?? null;
}
