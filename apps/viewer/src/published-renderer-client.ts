import type { PublicationArtifact } from "@invitica/invitation-schema";
import type { InvitationRendererProps, TemplateRendererRegistration } from "@invitica/renderer";
import { loadTemplateRendererRegistration } from "@invitica/renderer/lazy";
import type { ComponentType } from "react";

import {
  IncompatiblePublicationRendererError,
  rendererForPublicationRegistration,
} from "./published-renderer-contract";

export async function loadPublishedRenderer(
  artifact: PublicationArtifact,
): Promise<ComponentType<InvitationRendererProps>> {
  let registration: TemplateRendererRegistration;

  try {
    registration = await loadTemplateRendererRegistration(artifact.snapshot.rendererKey);
  } catch {
    throw new IncompatiblePublicationRendererError();
  }

  return rendererForPublicationRegistration(artifact, registration);
}
