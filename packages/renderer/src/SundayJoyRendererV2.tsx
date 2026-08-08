import type { InvitationRendererProps } from "./InvitationRenderer.js";
import { OccasionTemplateRenderer } from "./OccasionTemplateRenderer.js";

export function SundayJoyRendererV2(props: InvitationRendererProps) {
  return <OccasionTemplateRenderer {...props} variant="sunday-joy" />;
}
