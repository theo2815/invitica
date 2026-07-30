import type { TemplateRendererKey } from "@invitica/template-kit";
import type { ComponentType } from "react";

import { GardenPromiseRenderer } from "./GardenPromiseRenderer.js";
import { GardenPromiseRendererV2 } from "./GardenPromiseRendererV2.js";
import { GoldenHourRendererV2 } from "./GoldenHourRendererV2.js";
import { InvitationRenderer, type InvitationRendererProps } from "./InvitationRenderer.js";
import { LittleBlessingsRenderer } from "./LittleBlessingsRenderer.js";
import { LittleBlessingsRendererV2 } from "./LittleBlessingsRendererV2.js";
import {
  resolveTemplateRendererVersion,
  type TemplateRendererRegistration,
} from "./renderer-registration.js";
import { SundayJoyRendererV2 } from "./SundayJoyRendererV2.js";

export {
  type TemplateRendererRegistration,
  UnknownTemplateRendererError,
} from "./renderer-registration.js";

const templateRendererComponents = {
  "garden-promise-v1": GardenPromiseRenderer,
  "garden-promise-v2": GardenPromiseRendererV2,
  "golden-hour-v2": GoldenHourRendererV2,
  "little-blessings-v1": LittleBlessingsRenderer,
  "little-blessings-v2": LittleBlessingsRendererV2,
  "standard-v1": InvitationRenderer,
  "sunday-joy-v2": SundayJoyRendererV2,
} satisfies Record<TemplateRendererKey, ComponentType<InvitationRendererProps>>;

export function resolveTemplateRendererRegistration(
  rendererKey: string,
): TemplateRendererRegistration {
  const version = resolveTemplateRendererVersion(rendererKey);
  const typedRendererKey = rendererKey as TemplateRendererKey;

  return {
    component: templateRendererComponents[typedRendererKey],
    rendererKey: typedRendererKey,
    version,
  };
}

export function resolveTemplateRenderer(
  rendererKey: string,
): ComponentType<InvitationRendererProps> {
  return resolveTemplateRendererRegistration(rendererKey).component;
}
