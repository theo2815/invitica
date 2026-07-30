import type { InvitationRendererProps } from "./InvitationRenderer.js";
import { OccasionTemplateRenderer } from "./OccasionTemplateRenderer.js";

export function GardenPromiseRendererV2(props: InvitationRendererProps) {
  return <OccasionTemplateRenderer {...props} variant="garden-promise" />;
}
