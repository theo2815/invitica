"use client";

import {
  GUEST_LINK_FRAGMENT_KEY,
  type GuestContextResponse,
  guestContextResponseSchema,
  guestLinkTokenSchema,
  type PublicationArtifact,
} from "@invitica/invitation-schema";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { fetchWithTimeout } from "./fetch-with-timeout";
import { publicIdentifierFromInvitationPath } from "./invitation-path";
import { createSnapshotImageResolver } from "./published-media";
import { resolvePublishedRenderer } from "./published-renderer";
import { RsvpForm } from "./rsvp-form";

interface PersonalizedPublicationProps {
  artifact: PublicationArtifact;
  /** Per-deployment MapTiler key read from the served page, never from the snapshot (ADR-006). */
  mapTileKey?: string;
}

interface GuestCapability {
  publicIdentifier: string;
  token: string;
}

const GUEST_CONTEXT_TIMEOUT_MS = 10_000;

async function requestGuestContext(
  capability: GuestCapability,
  signal?: AbortSignal,
): Promise<GuestContextResponse | null> {
  const signalOption = signal ? { signal } : {};
  const response = await fetchWithTimeout(
    "/api/public/guest-context",
    {
      body: JSON.stringify(capability),
      headers: { "content-type": "application/json" },
      method: "POST",
      referrerPolicy: "no-referrer",
      ...signalOption,
    },
    GUEST_CONTEXT_TIMEOUT_MS,
  );
  if (!response.ok) return null;
  const result = guestContextResponseSchema.safeParse(await response.json());
  return result.success ? result.data : null;
}

export function PersonalizedPublication({ artifact, mapTileKey }: PersonalizedPublicationProps) {
  const [capability, setCapability] = useState<GuestCapability>();
  const [context, setContext] = useState<GuestContextResponse>();
  const [loadState, setLoadState] = useState<"idle" | "loading" | "unavailable">("idle");
  const Renderer = resolvePublishedRenderer(artifact);
  const resolveImage = useMemo(
    () => createSnapshotImageResolver(artifact.snapshot.assets),
    [artifact],
  );

  useEffect(() => {
    const token = guestLinkTokenSchema.safeParse(
      new URLSearchParams(window.location.hash.slice(1)).get(GUEST_LINK_FRAGMENT_KEY),
    );
    const publicIdentifier = publicIdentifierFromInvitationPath(window.location.pathname);
    if (!token.success || !publicIdentifier) return;

    const nextCapability = { publicIdentifier, token: token.data };
    const controller = new AbortController();
    setCapability(nextCapability);
    setLoadState("loading");
    void requestGuestContext(nextCapability, controller.signal)
      .then((result) => {
        if (result) {
          setContext(result);
          setLoadState("idle");
        } else {
          setLoadState("unavailable");
        }
      })
      .catch(() => setLoadState("unavailable"));

    return () => controller.abort();
  }, []);

  async function refreshContext() {
    if (!capability) return;
    try {
      const refreshed = await requestGuestContext(capability);
      if (refreshed) {
        setContext(refreshed);
        setLoadState("idle");
        return;
      }
      setLoadState("unavailable");
    } catch {
      setLoadState("unavailable");
    }
  }

  let rsvpSlot: ReactNode;
  if (capability && loadState === "loading") {
    rsvpSlot = (
      <p className="rsvp-card__notice" role="status">
        Preparing your response...
      </p>
    );
  } else if (capability && context) {
    rsvpSlot = (
      <RsvpForm
        context={context.rsvp}
        locale={artifact.snapshot.document.locale}
        onRefresh={refreshContext}
        onSaved={(response) =>
          setContext((current) =>
            current ? { ...current, rsvp: { ...current.rsvp, response } } : current,
          )
        }
        publicIdentifier={capability.publicIdentifier}
        timezone={artifact.snapshot.document.eventTimezone}
        token={capability.token}
      />
    );
  } else if (capability && loadState === "unavailable") {
    rsvpSlot = (
      <p className="rsvp-card__notice" role="status">
        Online response is temporarily unavailable. You can still read the invitation.
      </p>
    );
  }

  const personalizedProps = context?.recipientName ? { recipientName: context.recipientName } : {};
  const rsvpProps = rsvpSlot ? { rsvpSlot } : {};
  return (
    <Renderer
      document={artifact.snapshot.document}
      mapTileKey={mapTileKey ?? ""}
      mode="published"
      resolveImage={resolveImage}
      {...personalizedProps}
      {...rsvpProps}
    />
  );
}
