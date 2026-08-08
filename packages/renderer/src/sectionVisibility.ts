import type { InvitationSection } from "@invitica/invitation-schema";

import type { InvitationAudience, InvitationRendererProps } from "./InvitationRenderer.js";

/**
 * Preview keeps every editable section available. Published general links are
 * view-only, so the reply section appears only when a guest token is present.
 */
export function isSectionVisibleToAudience(
  section: InvitationSection,
  mode: InvitationRendererProps["mode"],
  audience: InvitationAudience,
): boolean {
  return (
    section.visible && !(section.type === "rsvp" && mode === "published" && audience === "general")
  );
}
