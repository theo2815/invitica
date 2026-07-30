const templateStillSources: Readonly<Record<string, string>> = {
  "garden-promise": "/landing/templates/garden-promise.jpg",
  "golden-hour": "/landing/templates/golden-hour.jpg",
  "sunday-joy": "/landing/templates/sunday-joy.jpg",
  "little-blessings": "/landing/templates/little-blessings.jpg",
};

export function templateStillSource(templateId: string) {
  return templateStillSources[templateId] ?? null;
}
