import type { PublicationArtifact } from "@invitica/invitation-schema";
import {
  type InvitationRendererProps,
  resolveTemplateRendererRegistration,
} from "@invitica/renderer";
import type { ComponentType } from "react";

export class IncompatiblePublicationRendererError extends Error {
  constructor() {
    super("The publication renderer is incompatible.");
    this.name = "IncompatiblePublicationRendererError";
  }
}

export function resolvePublishedRenderer(
  artifact: PublicationArtifact,
): ComponentType<InvitationRendererProps> {
  if (artifact.snapshot.rendererKey !== "garden-promise-v1") {
    throw new IncompatiblePublicationRendererError();
  }

  let registration: ReturnType<typeof resolveTemplateRendererRegistration>;

  try {
    registration = resolveTemplateRendererRegistration(artifact.snapshot.rendererKey);
  } catch {
    throw new IncompatiblePublicationRendererError();
  }

  if (registration.version !== artifact.snapshot.rendererVersion) {
    throw new IncompatiblePublicationRendererError();
  }

  return registration.component;
}
