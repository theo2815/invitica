import { littleBlessingsTemplate } from "./v1.js";

export const LITTLE_BLESSINGS_V2_TEMPLATE_VERSION_ID = "40000000-0000-4000-8000-000000000005";

/**
 * Version 2 establishes Little Blessings' immutable upgrade boundary. The
 * renderer is intentionally equivalent to v1 today: creators opt in to this
 * version before future template improvements can be made without changing
 * already-published v1 snapshots.
 */
export const littleBlessingsTemplateV2 = {
  ...littleBlessingsTemplate,
  templateVersionId: LITTLE_BLESSINGS_V2_TEMPLATE_VERSION_ID,
  supersedesTemplateVersionId: littleBlessingsTemplate.templateVersionId,
  version: 2,
  rendererKey: "little-blessings-v2",
  defaultDocument: {
    ...littleBlessingsTemplate.defaultDocument,
    templateVersionId: LITTLE_BLESSINGS_V2_TEMPLATE_VERSION_ID,
  },
  starterDocument: {
    ...littleBlessingsTemplate.starterDocument,
    templateVersionId: LITTLE_BLESSINGS_V2_TEMPLATE_VERSION_ID,
  },
} as const;
