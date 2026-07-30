import type { PublicationArtifact } from "@invitica/invitation-schema";
import {
  type InvitationRendererProps,
  resolveTemplateRendererRegistration,
} from "@invitica/renderer";
import type { ComponentType } from "react";

import {
  IncompatiblePublicationRendererError,
  rendererForPublicationRegistration,
} from "./published-renderer-contract";

export { IncompatiblePublicationRendererError } from "./published-renderer-contract";

export function resolvePublishedRenderer(
  artifact: PublicationArtifact,
): ComponentType<InvitationRendererProps> {
  let registration: ReturnType<typeof resolveTemplateRendererRegistration>;

  try {
    registration = resolveTemplateRendererRegistration(artifact.snapshot.rendererKey);
  } catch {
    throw new IncompatiblePublicationRendererError();
  }

  return rendererForPublicationRegistration(artifact, registration);
}
