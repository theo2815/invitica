"use client";

import type { TemplateManifest } from "@invitica/template-kit";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { createInvitationDraftAction } from "../../server/invitations/actions";
import styles from "./UseTemplateForm.module.css";

interface UseTemplateFormProps {
  creationRequestId: string;
  manifest: TemplateManifest;
  showAvailability?: boolean;
  usedBefore: boolean;
  variant?: "card" | "preview";
}

export function UseTemplateForm({
  creationRequestId,
  manifest,
  showAvailability = false,
  usedBefore,
  variant = "card",
}: UseTemplateFormProps) {
  const [state, formAction, pending] = useActionState(createInvitationDraftAction, {
    error: null,
  });
  const [confirmingReuse, setConfirmingReuse] = useState(false);
  const confirmationId = useId();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const reuseButtonRef = useRef<HTMLButtonElement>(null);
  const hadConfirmationRef = useRef(false);
  const available = manifest.qualityStatus === "production";

  useEffect(() => {
    if (confirmingReuse) {
      hadConfirmationRef.current = true;
      confirmButtonRef.current?.focus();
    } else if (hadConfirmationRef.current) {
      hadConfirmationRef.current = false;
      reuseButtonRef.current?.focus();
    }
  }, [confirmingReuse]);

  return (
    <form
      action={formAction}
      className={`${styles.creationForm} ${confirmingReuse ? styles.creationFormExpanded : ""}`}
      data-variant={variant}
    >
      <input name="invitationId" type="hidden" value={creationRequestId} />
      <input name="templateVersionId" type="hidden" value={manifest.templateVersionId} />
      <button
        aria-controls={usedBefore ? confirmationId : undefined}
        aria-expanded={usedBefore ? confirmingReuse : undefined}
        aria-label={pending ? "Creating draft" : available ? "Use this template" : "Preview only"}
        className={styles.primaryButton}
        disabled={!available || pending}
        onClick={usedBefore ? () => setConfirmingReuse(true) : undefined}
        ref={reuseButtonRef}
        title={available ? undefined : "This renderer-backed fixture is not available for creation"}
        type={usedBefore ? "button" : "submit"}
      >
        {pending ? "Creating draft…" : available ? "Use this template" : "Preview only"}
      </button>
      {confirmingReuse ? (
        <div className={styles.reuseConfirmation} id={confirmationId}>
          <p aria-live="polite">
            You have already started an invitation with {manifest.listing.name}. Create another one
            for a different event?
          </p>
          <div>
            <button ref={confirmButtonRef} type="submit">
              Create another
            </button>
            <Link href="/dashboard/invitations">View invitations</Link>
            <button onClick={() => setConfirmingReuse(false)} type="button">
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {state.error ? (
        <small className={styles.creationError} role="alert">
          {state.error}
        </small>
      ) : null}
      {showAvailability && !available ? (
        <small className={styles.creationNote}>
          Interactive concept preview — production creation is unavailable.
        </small>
      ) : null}
    </form>
  );
}
