import type { InvitationRendererProps } from "./InvitationRenderer.js";
import { LittleBlessingsRenderer } from "./LittleBlessingsRenderer.js";

/**
 * The v2 renderer owns all future Little Blessings visual changes. It begins
 * from the shared storybook renderer but opts into v2-only envelope artwork, so
 * historical v1 publications keep their original opening object.
 */
export function LittleBlessingsRendererV2(props: InvitationRendererProps) {
  return <LittleBlessingsRenderer {...props} envelopeArtwork="storybook-svg" />;
}
