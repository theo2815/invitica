import type { InvitationRendererProps } from "./InvitationRenderer.js";
import { LittleBlessingsRenderer } from "./LittleBlessingsRenderer.js";

/**
 * The v2 renderer owns all future Little Blessings visual changes. It begins
 * equivalent to v1 so adopting the new version cannot rewrite creator content
 * or surprise a creator before they choose to publish again.
 */
export function LittleBlessingsRendererV2(props: InvitationRendererProps) {
  return <LittleBlessingsRenderer {...props} />;
}
