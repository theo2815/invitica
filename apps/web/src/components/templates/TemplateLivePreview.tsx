"use client";

import { type InvitationOpeningState, resolveTemplateRenderer } from "@invitica/renderer";
import { resolveTemplateById } from "@invitica/template-kit";
import Link from "next/link";
import { useState } from "react";
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
  const [actionsDismissed, setActionsDismissed] = useState(false);
  const manifest = resolveTemplateById(templateId);
  const Renderer = resolveTemplateRenderer(manifest.rendererKey);
  const available = manifest.qualityStatus === "production";
  const previewPath = `/templates/${manifest.listing.id}/preview?intent=use`;
  const loginHref = `/login?next=${encodeURIComponent(previewPath)}`;
  const ctaVisible = openingState === "opened" && !actionsDismissed;

  return (
    <div className={styles.previewPage} data-cta-visible={ctaVisible}>
      <Renderer
        document={manifest.defaultDocument}
        mode="published"
        onOpeningStateChange={setOpeningState}
      />

      <aside
        aria-label="Template preview actions"
        className={styles.actionBar}
        hidden={!ctaVisible}
      >
        <button
          aria-label="Hide template actions"
          className={styles.dismissAction}
          onClick={() => setActionsDismissed(true)}
          type="button"
        >
          <span aria-hidden="true">{"\u00d7"}</span>
        </button>
        <div className={styles.actionCopy}>
          <strong>{manifest.listing.name}</strong>
          {returningFromLogin && authenticated ? (
            <small role="status">You’re signed in. Continue when you’re ready.</small>
          ) : null}
        </div>

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
