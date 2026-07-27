"use client";

import {
  GUEST_LINK_FRAGMENT_KEY,
  type GuestContextResponse,
  guestContextResponseSchema,
  guestLinkTokenSchema,
  type PublicationArtifact,
} from "@invitica/invitation-schema";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type GuestContextLoadState = "idle" | "loading" | "refreshing" | "retrying" | "unavailable";

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
  const [loadState, setLoadState] = useState<GuestContextLoadState>("idle");
  const activeController = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const Renderer = resolvePublishedRenderer(artifact);
  const resolveImage = useMemo(
    () => createSnapshotImageResolver(artifact.snapshot.assets),
    [artifact],
  );

  const loadGuestContext = useCallback(
    async (
      nextCapability: GuestCapability,
      nextState: "loading" | "refreshing" | "retrying",
      preserveContext: boolean,
    ): Promise<boolean> => {
      const requestId = requestSequence.current + 1;
      requestSequence.current = requestId;
      activeController.current?.abort();

      const controller = new AbortController();
      activeController.current = controller;
      setLoadState(nextState);

      let result: GuestContextResponse | null = null;
      try {
        result = await requestGuestContext(nextCapability, controller.signal);
      } catch {
        result = null;
      }

      if (requestId !== requestSequence.current) return false;
      if (activeController.current === controller) activeController.current = null;

      if (result) {
        setContext(result);
        setLoadState("idle");
        return true;
      }

      if (!preserveContext) setContext(undefined);
      setLoadState(preserveContext ? "idle" : "unavailable");
      return false;
    },
    [],
  );

  useEffect(() => {
    const token = guestLinkTokenSchema.safeParse(
      new URLSearchParams(window.location.hash.slice(1)).get(GUEST_LINK_FRAGMENT_KEY),
    );
    const publicIdentifier = publicIdentifierFromInvitationPath(window.location.pathname);
    if (!token.success || !publicIdentifier) return;

    const nextCapability = { publicIdentifier, token: token.data };
    setCapability(nextCapability);
    void loadGuestContext(nextCapability, "loading", false);

    return () => {
      requestSequence.current += 1;
      activeController.current?.abort();
      activeController.current = null;
    };
  }, [loadGuestContext]);

  async function refreshContext(): Promise<boolean> {
    if (!capability) return false;
    return loadGuestContext(capability, "refreshing", true);
  }

  async function retryContext() {
    if (!capability || loadState === "loading" || loadState === "retrying") return;
    await loadGuestContext(capability, "retrying", false);
  }

  let rsvpSlot: ReactNode;
  if (capability && loadState === "loading") {
    rsvpSlot = (
      <div aria-busy="true" className="rsvp-card rsvp-card--centered">
        <p className="rsvp-card__eyebrow">Your response</p>
        <p role="status">Preparing your response...</p>
      </div>
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
  } else if (capability && (loadState === "retrying" || loadState === "unavailable")) {
    const retrying = loadState === "retrying";
    rsvpSlot = (
      <div aria-busy={retrying || undefined} className="rsvp-card rsvp-card--centered">
        <p className="rsvp-card__eyebrow">Online response</p>
        <p role="status">
          {retrying
            ? "Checking whether online response is available..."
            : "Online response is temporarily unavailable. You can still read the invitation."}
        </p>
        <button
          className="rsvp-card__secondary"
          disabled={retrying}
          onClick={() => void retryContext()}
          type="button"
        >
          {retrying ? "Checking response..." : "Try online response again"}
        </button>
      </div>
    );
  }

  const personalizedProps = context?.recipientName ? { recipientName: context.recipientName } : {};
  const rsvpProps = rsvpSlot ? { rsvpSlot } : {};
  return (
    <Renderer
      // Token presence decides what a guest may see; token resolution decides what they may do. A
      // revoked link or a failed lookup must not silently erase an invited guest's reply section,
      // so this is deliberately not conditioned on `context`.
      audience={capability ? "personalized" : "general"}
      document={artifact.snapshot.document}
      mapTileKey={mapTileKey ?? ""}
      mode="published"
      resolveImage={resolveImage}
      {...personalizedProps}
      {...rsvpProps}
    />
  );
}
