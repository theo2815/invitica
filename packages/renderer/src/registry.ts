import type { TemplateRendererKey } from "@invitica/template-kit";
import type { ComponentType } from "react";

import { GardenPromiseRenderer } from "./GardenPromiseRenderer.js";
import { InvitationRenderer, type InvitationRendererProps } from "./InvitationRenderer.js";

export class UnknownTemplateRendererError extends Error {
  constructor(rendererKey: string) {
    super(`Unknown template renderer: ${rendererKey}`);
    this.name = "UnknownTemplateRendererError";
  }
}

export interface TemplateRendererRegistration {
  readonly component: ComponentType<InvitationRendererProps>;
  readonly version: number;
}

const templateRendererRegistry = {
  "garden-promise-v1": {
    component: GardenPromiseRenderer,
    version: 1,
  },
  "standard-v1": {
    component: InvitationRenderer,
    version: 1,
  },
} satisfies Record<TemplateRendererKey, TemplateRendererRegistration>;

export function resolveTemplateRendererRegistration(
  rendererKey: string,
): TemplateRendererRegistration {
  if (!Object.hasOwn(templateRendererRegistry, rendererKey)) {
    throw new UnknownTemplateRendererError(rendererKey);
  }

  return templateRendererRegistry[rendererKey as TemplateRendererKey];
}

export function resolveTemplateRenderer(
  rendererKey: string,
): ComponentType<InvitationRendererProps> {
  return resolveTemplateRendererRegistration(rendererKey).component;
}
