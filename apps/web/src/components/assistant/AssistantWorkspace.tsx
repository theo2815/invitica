"use client";

import type { InvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateRenderer } from "@invitica/renderer";
import type { TemplateRendererKey } from "@invitica/template-kit";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useState } from "react";

import { describeProposalChanges } from "../../lib/invitations/proposal-diff";
import {
  countUnwrittenSections,
  type SectionProgress,
} from "../../lib/invitations/section-progress";
import { getMapTileKey } from "../../lib/map-tile-key";
import { loadAssistantInvitationAction } from "../../server/assistant/actions";
import type { CreatorImageAsset } from "../../server/media/library";
import { Select } from "../forms/Select";
import { useDraftFlush } from "../invitations/DraftFlushProvider";
import { useAssistant } from "./AssistantProvider";
import { AssistantUsageMeter } from "./AssistantUsage";
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
  sections: readonly SectionProgress[];
}

type LoadState = "error" | "idle" | "loading";

/**
 * The heading over the section list, which is the whole point of the list.
 *
 * A creator glancing at this column wants one number: how much is left. Counting eleven rows
 * to find it would make the list a puzzle rather than an answer, so the count is the heading
 * and the rows are the detail underneath it.
 */
function sectionSummary(sections: readonly SectionProgress[]): string {
  const left = countUnwrittenSections(sections);

  if (left === 0) return "Every section has your own words in it.";
  if (left === 1) return "1 section still has the template's starting text.";

  return `${left} sections still have the template's starting text.`;
}

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
  children,
  invitations,
}: {
  /** The conversation. Passed in so one grid can order it against the picker per width. */
  children: ReactNode;
  invitations: readonly AssistantWorkspaceInvitation[];
}) {
  const { clearProposal, invitationId, proposal, setInvitationId, setMode } = useAssistant();
  const router = useRouter();
  const flushDraft = useDraftFlush();
  const pickerId = useId();
  const progressId = useId();
  const introId = useId();
  const mapTileKey = getMapTileKey();

  const [loaded, setLoaded] = useState<LoadedInvitation | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [applying, setApplying] = useState(false);

  const select = useCallback(
    async (nextId: string) => {
      // The page has already filtered this list to invitations the shared editor can apply a
      // proposal to, so drafting is available for every one of them. Whether any is published
      // is not loaded here, and a suggestion that is merely unmade costs less than one that
      // sends a creator to a tab which refuses them.
      setInvitationId(nextId || null, { canDraft: true, canOrganize: false });
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
        sections: result.sections,
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

  const Renderer = loaded ? resolveTemplateRenderer(loaded.rendererKey) : null;
  const shownDocument = staged?.document ?? loaded?.document ?? null;
  const hasInvitations = invitations.length > 0;

  /*
    The page's whole layout, with the conversation passed in as a child.

    It owns all three regions because the order they belong in changes with the width. On a
    phone the picker has to come before the conversation — it is what unlocks two of Invi's
    three tabs, and burying it under a 22 rem chat meant scrolling past the tool to find the
    thing that switches the tool on. On a wide screen the conversation takes its own column
    and everything else stacks beside it. One grid can say both; two sibling elements in a
    page could not.
  */
  return (
    <div className={styles.layout}>
      <div className={styles.pickerArea}>
        <div className={styles.picker}>
          <Select
            disabled={loadState === "loading" || !hasInvitations}
            id={pickerId}
            label="Draft into"
            onChange={(value) => void select(value)}
            options={invitations.map((invitation) => ({
              label: `${invitation.title} · ${invitation.templateName}`,
              value: invitation.invitationId,
            }))}
            placeholder={hasInvitations ? "Choose an invitation…" : "No invitations yet"}
            value={invitationId ?? ""}
          />
          <p>
            {hasInvitations
              ? "Choosing one lets Invi draft into it and read a guest list for it. Nothing is saved from this page — you apply a draft in the editor."
              : "Invi drafts into an invitation you have already started. Create one from a template first, then come back and describe your event."}
          </p>
        </div>

        <AssistantUsageMeter />
      </div>

      <div className={styles.conversationArea}>{children}</div>

      <div className={styles.detailArea}>
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

        {/*
          What Invi can do, and what each one needs, before a creator has chosen anything.

          It mirrors the three tabs in the conversation exactly, in the same words, because
          a creator opening this page for the first time otherwise sees a chat box and a
          dropdown and has to guess that the two are related. Replaced by real content the
          moment an invitation is loaded.
        */}
        {!loaded && loadState === "idle" ? (
          <section aria-labelledby={introId} className={styles.intro}>
            <p className={styles.eyebrow}>Getting started</p>
            <h2 id={introId}>Three things Invi can do</h2>
            <ul className={styles.introList}>
              <li>
                <strong>Answer a question</strong>
                <span>
                  Ready now. Ask how publishing, personalized links, or replies work and Invi
                  answers from Invitica&apos;s own help material.
                </span>
              </li>
              <li>
                <strong>Draft my invitation</strong>
                <span>
                  {hasInvitations
                    ? "Choose an invitation above, then describe your event. You read the draft and apply it yourself."
                    : "Needs an invitation. Create one from a template first."}
                </span>
              </li>
              <li>
                <strong>Organize my guest list</strong>
                <span>
                  Paste a list the way it already exists and Invi sorts it into invitations. Needs
                  an invitation you have published, and you create the rows yourself in the Guest
                  Desk.
                </span>
              </li>
            </ul>
          </section>
        ) : null}

        {loaded && loaded.sections.length > 0 ? (
          <section aria-labelledby={progressId} className={styles.progress}>
            <div>
              <p className={styles.eyebrow}>Sections</p>
              <h2 id={progressId}>{sectionSummary(loaded.sections)}</h2>
            </div>

            {/*
            An ordered list, numbered by the editor's own numbering rather than by the
            browser's — a hidden section is still counted and still printed on its card, so
            `list-style: none` plus the stored position is what keeps this column and the
            editor saying the same thing about "Section 5".

            State is carried by the words "Written" and "Starting text", never by colour
            alone. Nothing here is interactive: it answers what is left, and the editor is
            where a creator acts on the answer.
          */}
            <ol className={styles.sections}>
              {loaded.sections.map((section) => (
                <li key={section.type}>
                  <span className={styles.sectionName}>
                    {section.position}. {section.name}
                    {section.visible ? null : (
                      <span className={styles.sectionHidden}> · Hidden from guests</span>
                    )}
                  </span>
                  <span className={section.written ? styles.written : styles.unwritten}>
                    {section.written ? "Written" : "Starting text"}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {staged ? (
          <section aria-labelledby="assistant-page-proposal" className={styles.proposal}>
            <div>
              <p className={styles.eyebrow}>Invi&apos;s draft</p>
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
      </div>
    </div>
  );
}
