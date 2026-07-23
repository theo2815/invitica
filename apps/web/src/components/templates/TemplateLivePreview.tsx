"use client";

import { type InvitationOpeningState, resolveTemplateRenderer } from "@invitica/renderer";
import { resolveTemplateById } from "@invitica/template-kit";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft } from "../Icons";
import styles from "./TemplateLivePreview.module.css";
import { UseTemplateForm } from "./UseTemplateForm";

interface TemplateLivePreviewProps {
  authenticated: boolean;
  creationRequestId: string;
  returningFromLogin: boolean;
  templateId: string;
  usedBefore: boolean;
}

export function TemplateLivePreview({
  authenticated,
  creationRequestId,
  returningFromLogin,
  templateId,
  usedBefore,
}: TemplateLivePreviewProps) {
  const [openingState, setOpeningState] = useState<InvitationOpeningState>("closed");
  const [actionsExpanded, setActionsExpanded] = useState(true);
  const actionPanelId = useId();
  const dismissActionRef = useRef<HTMLButtonElement>(null);
  const restoreActionRef = useRef<HTMLButtonElement>(null);
  const actionsToggledRef = useRef(false);
  const manifest = resolveTemplateById(templateId);
  const Renderer = resolveTemplateRenderer(manifest.rendererKey);
  const available = manifest.qualityStatus === "production";
  const previewPath = `/templates/${manifest.listing.id}/preview?intent=use`;
  const loginHref = `/login?next=${encodeURIComponent(previewPath)}`;
  const actionsAvailable = openingState === "opened";

  useEffect(() => {
    if (!actionsAvailable || !actionsToggledRef.current) {
      return;
    }

    if (actionsExpanded) {
      dismissActionRef.current?.focus();
    } else {
      restoreActionRef.current?.focus();
    }
  }, [actionsAvailable, actionsExpanded]);

  function setActionPanelExpanded(expanded: boolean) {
    actionsToggledRef.current = true;
    setActionsExpanded(expanded);
  }

  return (
    <div className={styles.previewPage} data-cta-visible={actionsAvailable}>
      <Renderer
        document={manifest.defaultDocument}
        mode="published"
        onOpeningStateChange={setOpeningState}
      />

      <aside
        aria-label="Template preview actions"
        className={styles.actionDock}
        data-expanded={actionsExpanded}
        hidden={!actionsAvailable}
        onKeyDown={(event) => {
          if (event.key === "Escape" && actionsExpanded) {
            event.preventDefault();
            setActionPanelExpanded(false);
          }
        }}
      >
        <div
          aria-hidden={!actionsExpanded}
          className={styles.actionPanel}
          id={actionPanelId}
          inert={!actionsExpanded ? true : undefined}
        >
          <div className={styles.actionHeader}>
            <div className={styles.actionCopy}>
              <small>CREATE YOUR INVITATION</small>
              <strong>{manifest.listing.name}</strong>
              {returningFromLogin && authenticated ? (
                <span role="status">You’re signed in. Continue when you’re ready.</span>
              ) : null}
            </div>
            <button
              aria-label="Hide template actions"
              className={styles.dismissAction}
              onClick={() => setActionPanelExpanded(false)}
              ref={dismissActionRef}
              type="button"
            >
              <span aria-hidden="true">{"\u00d7"}</span>
            </button>
          </div>

          <div className={styles.actionBody}>
            {available && authenticated ? (
              <UseTemplateForm
                creationRequestId={creationRequestId}
                manifest={manifest}
                usedBefore={usedBefore}
                variant="preview"
              />
            ) : available ? (
              <Link className={styles.loginAction} href={loginHref}>
                Log in to use this template
              </Link>
            ) : (
              <button className={styles.unavailableAction} disabled type="button">
                Preview only
              </button>
            )}
          </div>
        </div>

        <button
          aria-controls={actionPanelId}
          aria-expanded={actionsExpanded}
          aria-hidden={actionsExpanded}
          aria-label="Show template actions"
          className={styles.restoreAction}
          onClick={() => setActionPanelExpanded(true)}
          ref={restoreActionRef}
          tabIndex={actionsExpanded ? -1 : 0}
          type="button"
        >
          <ChevronLeft />
        </button>
      </aside>

      <noscript>
        <div className={styles.noScriptAction}>
          <p>{manifest.listing.name} template preview</p>
          <a href={authenticated ? "/dashboard/templates" : loginHref}>
            {authenticated ? "Open templates" : "Log in to use this template"}
          </a>
        </div>
      </noscript>
    </div>
  );
}
