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

const SUPPORTED_RENDERER_KEYS: ReadonlySet<string> = new Set([
  "garden-promise-v1",
  "little-blessings-v1",
  "standard-v1",
]);

export function resolvePublishedRenderer(
  artifact: PublicationArtifact,
): ComponentType<InvitationRendererProps> {
  if (!SUPPORTED_RENDERER_KEYS.has(artifact.snapshot.rendererKey)) {
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
