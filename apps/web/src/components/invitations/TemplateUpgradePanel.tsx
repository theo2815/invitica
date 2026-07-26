"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { upgradeInvitationTemplateAction } from "../../server/invitations/actions";
import styles from "./InvitationPublicationPanel.module.css";

export interface AvailableTemplateUpgrade {
  currentTemplateVersionId: string;
  targetTemplateVersionId: string;
  targetVersion: number;
  templateName: string;
}

interface TemplateUpgradePanelProps {
  draftReady: boolean;
  invitationId: string;
  revision: number;
  upgrade?: AvailableTemplateUpgrade | null;
}

type UpgradeStatus = "idle" | "applying" | "applied" | "error";

export function TemplateUpgradePanel({
  draftReady,
  invitationId,
  revision,
  upgrade = null,
}: TemplateUpgradePanelProps) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<UpgradeStatus>("idle");
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const updateButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirmationOpen) return;
    cancelButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setConfirmationOpen(false);
        updateButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmationOpen]);

  if (!upgrade) return null;
  const availableUpgrade = upgrade;

  function closeConfirmation() {
    setConfirmationOpen(false);
    updateButtonRef.current?.focus();
  }

  async function confirmUpgrade() {
    closeConfirmation();
    setMessage(null);
    setStatus("applying");

    try {
      const result = await upgradeInvitationTemplateAction({
        currentTemplateVersionId: availableUpgrade.currentTemplateVersionId,
        expectedRevision: revision,
        invitationId,
        targetTemplateVersionId: availableUpgrade.targetTemplateVersionId,
      });

      if (result.status === "updated") {
        setMessage("Draft updated. Reload to continue editing, then publish when you are ready.");
        setStatus("applied");
      } else {
        setMessage(result.message);
        setStatus("error");
      }
    } catch {
      setMessage("The template could not be updated. Your saved draft is unchanged.");
      setStatus("error");
    }
  }

  return (
    <section aria-labelledby="template-upgrade-heading" className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <p>Template update</p>
          <h3 id="template-upgrade-heading">A newer {upgrade.templateName} is available</h3>
        </div>
        <span data-status={status}>Version {upgrade.targetVersion}</span>
      </div>

      <p className={styles.hint}>
        Your wording, event details, section choices, and photos stay exactly as saved. Your current
        published invitation stays live until you publish the updated draft.
      </p>

      <div aria-live="polite" className={styles.statusMessage}>
        {message ? <p role={status === "error" ? "alert" : "status"}>{message}</p> : null}
      </div>

      {status === "applied" ? (
        <button
          className={styles.publishButton}
          onClick={() => window.location.reload()}
          type="button"
        >
          Reload updated draft
        </button>
      ) : (
        <button
          className={styles.publishButton}
          disabled={!draftReady || status === "applying"}
          onClick={() => setConfirmationOpen(true)}
          ref={updateButtonRef}
          type="button"
        >
          {status === "applying" ? "Updating…" : "Review template update"}
        </button>
      )}

      {!draftReady ? <p className={styles.hint}>Save the current edit before updating.</p> : null}

      {confirmationOpen && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.dialogBackdrop}>
              <section
                aria-describedby="template-upgrade-description"
                aria-labelledby="template-upgrade-title"
                aria-modal="true"
                className={styles.dialog}
                role="dialog"
              >
                <p className={styles.dialogEyebrow}>Template update</p>
                <h3 id="template-upgrade-title">Update to version {upgrade.targetVersion}?</h3>
                <p id="template-upgrade-description">
                  This updates only the draft's template and renderer version. It will not reapply
                  defaults, replace your content, or change the invitation guests see now.
                </p>
                <div className={styles.dialogActions}>
                  <button onClick={closeConfirmation} ref={cancelButtonRef} type="button">
                    Keep current version
                  </button>
                  <button onClick={() => void confirmUpgrade()} type="button">
                    Update draft
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
