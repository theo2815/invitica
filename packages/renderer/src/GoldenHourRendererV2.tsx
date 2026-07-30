import type { InvitationRendererProps } from "./InvitationRenderer.js";
import { OccasionTemplateRenderer } from "./OccasionTemplateRenderer.js";

export function GoldenHourRendererV2(props: InvitationRendererProps) {
  return <OccasionTemplateRenderer {...props} variant="golden-hour" />;
}
