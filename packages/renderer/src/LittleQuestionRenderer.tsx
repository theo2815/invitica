import type { InvitationRendererProps } from "./InvitationRenderer.js";
import { OccasionTemplateRenderer } from "./OccasionTemplateRenderer.js";

export function LittleQuestionRenderer(props: InvitationRendererProps) {
  return <OccasionTemplateRenderer {...props} variant="little-question" />;
}
