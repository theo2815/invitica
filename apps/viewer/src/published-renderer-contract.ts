import type { PublicationArtifact } from "@invitica/invitation-schema";
import type { InvitationRendererProps, TemplateRendererRegistration } from "@invitica/renderer";
import type { ComponentType } from "react";

export class IncompatiblePublicationRendererError extends Error {
  constructor() {
    super("The publication renderer is incompatible.");
    this.name = "IncompatiblePublicationRendererError";
  }
}

export function rendererForPublicationRegistration(
  artifact: PublicationArtifact,
  registration: TemplateRendererRegistration,
): ComponentType<InvitationRendererProps> {
  if (
    registration.rendererKey !== artifact.snapshot.rendererKey ||
    registration.version !== artifact.snapshot.rendererVersion
  ) {
    throw new IncompatiblePublicationRendererError();
  }

  return registration.component;
}
