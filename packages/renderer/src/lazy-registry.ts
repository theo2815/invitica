import type { TemplateRendererKey } from "@invitica/template-kit";
import type { ComponentType } from "react";

import type { InvitationRendererProps } from "./InvitationRenderer.js";
import {
  resolveTemplateRendererVersion,
  type TemplateRendererRegistration,
} from "./renderer-registration.js";

type TemplateRendererLoader = () => Promise<ComponentType<InvitationRendererProps>>;

const templateRendererLoaders = {
  "garden-promise-v1": () =>
    import("./GardenPromiseRenderer.js").then((module) => module.GardenPromiseRenderer),
  "garden-promise-v2": () =>
    import("./GardenPromiseRendererV2.js").then((module) => module.GardenPromiseRendererV2),
  "golden-hour-v2": () =>
    import("./GoldenHourRendererV2.js").then((module) => module.GoldenHourRendererV2),
  "little-blessings-v1": () =>
    import("./LittleBlessingsRenderer.js").then((module) => module.LittleBlessingsRenderer),
  "little-blessings-v2": () =>
    import("./LittleBlessingsRendererV2.js").then((module) => module.LittleBlessingsRendererV2),
  "little-question-v1": () =>
    import("./LittleQuestionRenderer.js").then((module) => module.LittleQuestionRenderer),
  "standard-v1": () =>
    import("./InvitationRenderer.js").then((module) => module.InvitationRenderer),
  "sunday-joy-v2": () =>
    import("./SundayJoyRendererV2.js").then((module) => module.SundayJoyRendererV2),
} satisfies Record<TemplateRendererKey, TemplateRendererLoader>;

export async function loadTemplateRendererRegistration(
  rendererKey: string,
): Promise<TemplateRendererRegistration> {
  const version = resolveTemplateRendererVersion(rendererKey);
  const typedRendererKey = rendererKey as TemplateRendererKey;
  const component = await templateRendererLoaders[typedRendererKey]();

  return { component, rendererKey: typedRendererKey, version };
}
