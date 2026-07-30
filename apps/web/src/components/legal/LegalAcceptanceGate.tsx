"use client";

import { type FormEvent, useActionState, useState } from "react";
import type { AuthActionState } from "../../server/auth/types";
import { validateTermsAcceptance } from "../../server/auth/validation";
import { acceptCurrentTerms } from "../../server/legal/actions";
import { PendingButton } from "../auth/AuthFormFields";
import styles from "../auth/AuthPage.module.css";
import { AuthShell } from "../auth/AuthShell";
import { TermsAcceptanceField } from "./TermsAcceptanceField";

const initialState: AuthActionState = { error: null };

export function LegalAcceptanceGate({ nextPath }: { nextPath: string }) {
  const [state, formAction] = useActionState(acceptCurrentTerms, initialState);
  const [checked, setChecked] = useState(false);
  const [clientError, setClientError] = useState<string>();
  const error = checked ? undefined : (clientError ?? state.fieldErrors?.termsAccepted);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateTermsAcceptance(new FormData(event.currentTarget));
    if (!result.ok) {
      event.preventDefault();
      setClientError(result.fieldErrors.termsAccepted);
      document.getElementById("legal-terms-accepted")?.focus();
      return;
    }

    setClientError(undefined);
  }

  return (
    <AuthShell
      description="Review the current documents before entering your creator studio."
      eyebrow="One clear checkpoint"
      heading="Continue to Invitica"
      headingId="legal-acceptance-heading"
      story={{
        heading: "Your work is still here.",
        label: "Terms update",
        text: "This checkpoint records the exact document versions you accepted. It does not collect your IP address or browser details.",
      }}
    >
      <form
        action={formAction}
        aria-describedby={state.error ? "legal-acceptance-error" : undefined}
        aria-label="Accept the current Terms of Service"
        className={styles.formWithTopMargin}
        noValidate
        onSubmit={handleSubmit}
      >
        <input name="next" type="hidden" value={nextPath} />
        <TermsAcceptanceField
          checked={checked}
          error={error}
          id="legal-terms-accepted"
          onChange={(nextChecked) => {
            setChecked(nextChecked);
            if (nextChecked) {
              setClientError(undefined);
            }
          }}
        />
        {state.error ? (
          <p className={styles.error} id="legal-acceptance-error" role="alert">
            {state.error}
          </p>
        ) : null}
        <PendingButton idleLabel="Agree and continue" pendingLabel="Recording acceptance…" />
      </form>
    </AuthShell>
  );
}
