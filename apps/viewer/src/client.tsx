import "@fontsource-variable/fraunces/index.css";
import "@fontsource-variable/instrument-sans/index.css";
import "./rsvp-form.css";

import { parsePublicationArtifact } from "@invitica/invitation-schema";
import { hydrateRoot } from "react-dom/client";

import { publicIdentifierFromInvitationPath } from "./invitation-path";
import { MAP_TILE_KEY_META } from "./map-tile-key";
import { PersonalizedPublication } from "./personalized-publication";
import { loadPublishedRenderer } from "./published-renderer-client";
import { recordPublicationView } from "./view-tracking";

function readMapTileKey(): string {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${MAP_TILE_KEY_META}"]`);
  return meta?.content ?? "";
}

async function hydratePublication(): Promise<void> {
  const root = document.getElementById("viewer-root");
  const data = document.getElementById("publication-artifact");

  if (!root || !data?.textContent) {
    return;
  }

  try {
    const parsed: unknown = JSON.parse(data.textContent);
    const artifact = parsePublicationArtifact(parsed);
    const publicIdentifier = publicIdentifierFromInvitationPath(window.location.pathname);
    if (publicIdentifier) void recordPublicationView(publicIdentifier);

    const renderer = await loadPublishedRenderer(artifact);

    hydrateRoot(
      root,
      <PersonalizedPublication
        artifact={artifact}
        mapTileKey={readMapTileKey()}
        renderer={renderer}
      />,
    );
  } catch {
    console.error(JSON.stringify({ event: "viewer_hydration_failed" }));
  }
}

void hydratePublication();
