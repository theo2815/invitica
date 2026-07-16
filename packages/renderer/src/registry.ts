import type { TemplateRendererKey } from "@invitica/template-kit";
import type { ComponentType } from "react";

import { InvitationRenderer, type InvitationRendererProps } from "./InvitationRenderer.js";

export class UnknownTemplateRendererError extends Error {
  constructor(rendererKey: string) {
    super(`Unknown template renderer: ${rendererKey}`);
    this.name = "UnknownTemplateRendererError";
  }
}

const templateRendererRegistry = {
  "standard-v1": InvitationRenderer,
} satisfies Record<TemplateRendererKey, ComponentType<InvitationRendererProps>>;

export function resolveTemplateRenderer(
  rendererKey: string,
): ComponentType<InvitationRendererProps> {
  if (!Object.hasOwn(templateRendererRegistry, rendererKey)) {
    throw new UnknownTemplateRendererError(rendererKey);
  }

  return templateRendererRegistry[rendererKey as TemplateRendererKey];
}
