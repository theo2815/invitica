"use client";

import type { InvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateRenderer } from "@invitica/renderer";
import type { TemplateRendererKey } from "@invitica/template-kit";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { describeProposalChanges } from "../../lib/invitations/proposal-diff";
import { getMapTileKey } from "../../lib/map-tile-key";
import { loadAssistantInvitationAction } from "../../server/assistant/actions";
import type { CreatorImageAsset } from "../../server/media/library";
import { useDraftFlush } from "../invitations/DraftFlushProvider";
import { useAssistant } from "./AssistantProvider";
import styles from "./AssistantWorkspace.module.css";

export interface AssistantWorkspaceInvitation {
  invitationId: string;
  templateName: string;
  title: string;
}

interface LoadedInvitation {
  assets: readonly CreatorImageAsset[];
  document: InvitationDocument;
  rendererKey: TemplateRendererKey;
}

type LoadState = "error" | "idle" | "loading";

/**
 * The drafting surface for creators who are not in an editor.
 *
 * It exists because the floating panel has an invitation in context and this page does not:
 * on `/dashboard/invitations/[id]` the assistant knows which invitation it is drafting and
 * renders into a preview that is already on screen, and here it knows neither. So the page
 * supplies both — a choice of invitation, and a preview of its own built from the same
 * renderer the editor and the published page use.
 */
export function AssistantWorkspace({
  invitations,
}: {
  invitations: readonly AssistantWorkspaceInvitation[];
}) {
  const { clearProposal, invitationId, proposal, setInvitationId, setMode } = useAssistant();
  const router = useRouter();
  const flushDraft = useDraftFlush();
  const pickerId = useId();
  const mapTileKey = getMapTileKey();

  const [loaded, setLoaded] = useState<LoadedInvitation | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [applying, setApplying] = useState(false);

  const select = useCallback(
    async (nextId: string) => {
      setInvitationId(nextId || null);
      // A proposal belongs to the invitation it was drafted for. Switching away from that
      // invitation makes it meaningless rather than merely out of view.
      clearProposal();
      setLoaded(null);

      if (!nextId) {
        setLoadState("idle");
        return;
      }

      setLoadState("loading");
      const result = await loadAssistantInvitationAction({ invitationId: nextId });

      if (result.status === "error") {
        setLoadState("error");
        return;
      }

      setLoaded({
        assets: result.assets,
        document: result.document,
        rendererKey: result.rendererKey,
      });
      setLoadState("idle");
    },
    [clearProposal, setInvitationId],
  );

  // Drafting is the reason to be on this page with an invitation chosen, so choosing one
  // puts the composer in that mode rather than making it a second, easily-missed step.
  useEffect(() => {
    if (invitationId) setMode("document");
  }, [invitationId, setMode]);

  // The page owns this selection, so it releases it on the way out. Without this the
  // floating panel would keep offering to draft into an invitation on every other route.
  useEffect(() => () => setInvitationId(null), [setInvitationId]);

  const assetsById = useMemo(
    () => new Map((loaded?.assets ?? []).map((asset) => [asset.id, asset])),
    [loaded],
  );

  const resolveImage = useCallback(
    (assetId: string) => {
      const asset = assetsById.get(assetId);
      return asset
        ? { height: asset.height, renditions: asset.renditions, width: asset.width }
        : null;
    },
    [assetsById],
  );

  const staged = proposal?.invitationId === invitationId ? proposal : null;

  const changes = useMemo(
    () => (staged && loaded ? describeProposalChanges(loaded.document, staged.document) : []),
    [loaded, staged],
  );

  /**
   * Hands the draft to the editor, which is the only place it can be saved.
   *
   * The proposal is held in the creator shell, which outlives this route, so nothing has to
   * be serialized through the URL or storage to survive the trip — the editor reads the same
   * object on the other side. The flush is what makes the trip safe in the other direction:
   * if a draft elsewhere is mid-save, it settles before the navigation rather than being
   * abandoned by it.
   */
  async function applyToInvitation() {
    if (!staged || applying) return;
    setApplying(true);
    try {
      await flushDraft();
      router.push(`/dashboard/invitations/${staged.invitationId}`);
    } finally {
      setApplying(false);
    }
  }

  if (invitations.length === 0) {
    return (
      <section className={styles.workspace}>
        <p className={styles.empty}>
          The assistant drafts into an invitation you have already started. Create one from a
          template first, then come back and describe your event.
        </p>
      </section>
    );
  }

  const Renderer = loaded ? resolveTemplateRenderer(loaded.rendererKey) : null;
  const shownDocument = staged?.document ?? loaded?.document ?? null;

  return (
    <section className={styles.workspace}>
      <div className={styles.picker}>
        <label htmlFor={pickerId}>Draft into</label>
        <select
          id={pickerId}
          onChange={(event) => void select(event.target.value)}
          value={invitationId ?? ""}
        >
          <option value="">Choose an invitation…</option>
          {invitations.map((invitation) => (
            <option key={invitation.invitationId} value={invitation.invitationId}>
              {invitation.title} · {invitation.templateName}
            </option>
          ))}
        </select>
        <p>
          Only invitations you have already started appear here. Nothing is saved from this page —
          you apply a draft in the editor.
        </p>
      </div>

      {loadState === "loading" ? (
        <p className={styles.status} role="status">
          Opening that invitation…
        </p>
      ) : null}

      {loadState === "error" ? (
        <p className={styles.status} role="alert">
          That invitation could not be opened. Choose it again, or open it from Invitations.
        </p>
      ) : null}

      {staged ? (
        <section aria-labelledby="assistant-page-proposal" className={styles.proposal}>
          <div>
            <p className={styles.eyebrow}>Assistant draft</p>
            <h2 id="assistant-page-proposal">This is a draft. Nothing has been saved.</h2>
            <p className={styles.proposalNote}>
              Apply it to open your invitation with this draft ready, then keep it there to save.
              Your invitation is unchanged until you do.
            </p>
          </div>

          {changes.length > 0 ? (
            <ul className={styles.changes}>
              {changes.map((change) => (
                <li key={change.type}>
                  <strong>{change.type}</strong>
                  <span>
                    {[
                      change.visibility === "shown"
                        ? "now shown to guests"
                        : change.visibility === "hidden"
                          ? "now hidden from guests"
                          : null,
                      change.fields.length > 0 ? `changes the ${change.fields.join(", ")}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.proposalNote}>
              This draft matches what your invitation already says.
            </p>
          )}

          <div className={styles.proposalActions}>
            <button
              className={styles.apply}
              disabled={applying}
              onClick={() => void applyToInvitation()}
              type="button"
            >
              {applying ? "Opening…" : "Apply to invitation"}
            </button>
            <button onClick={() => clearProposal()} type="button">
              Discard the draft
            </button>
          </div>
        </section>
      ) : null}

      {Renderer && shownDocument ? (
        <div className={styles.previewPanel}>
          <p className={styles.eyebrow}>
            {staged ? "Draft preview" : "Your invitation now"} · Shared renderer
          </p>
          <div className={styles.previewFrame}>
            <Renderer
              audience="personalized"
              document={shownDocument}
              mapTileKey={mapTileKey}
              mode="preview"
              resolveImage={resolveImage}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
