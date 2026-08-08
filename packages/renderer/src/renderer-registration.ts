import type { TemplateRendererKey } from "@invitica/template-kit";
import type { ComponentType } from "react";

import type { InvitationRendererProps } from "./InvitationRenderer.js";

export class UnknownTemplateRendererError extends Error {
  constructor(rendererKey: string) {
    super(`Unknown template renderer: ${rendererKey}`);
    this.name = "UnknownTemplateRendererError";
  }
}

export interface TemplateRendererRegistration {
  readonly component: ComponentType<InvitationRendererProps>;
  readonly rendererKey: TemplateRendererKey;
  readonly version: number;
}

const templateRendererVersions = {
  "garden-promise-v1": 1,
  "garden-promise-v2": 2,
  "golden-hour-v2": 2,
  "little-blessings-v1": 1,
  "little-blessings-v2": 2,
  "little-question-v1": 1,
  "standard-v1": 1,
  "sunday-joy-v2": 2,
} as const satisfies Record<TemplateRendererKey, number>;

export function resolveTemplateRendererVersion(rendererKey: string): number {
  if (!Object.hasOwn(templateRendererVersions, rendererKey)) {
    throw new UnknownTemplateRendererError(rendererKey);
  }

  return templateRendererVersions[rendererKey as TemplateRendererKey];
}
