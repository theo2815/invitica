"use client";

import { useActionState, useState } from "react";

import { updateCreatorName } from "../../server/account/actions";
import type { AuthActionState } from "../../server/auth/types";
import { FieldError } from "../auth/AuthFormFields";
import authStyles from "../auth/AuthPage.module.css";
import { PendingFormButton } from "../feedback/PendingFormButton";
import styles from "./Settings.module.css";
import { SettingsStatus } from "./SettingsSection";

const initialState: AuthActionState = { error: null };

/**
 * The name the creator shell greets them by, and the only one Invitica displays.
 *
 * The field is controlled so a failed submission keeps what was typed. A server action resets an
 * uncontrolled input to its `defaultValue`, which would silently discard a 60-character name
 * because the address bar had timed out.
 */
export function AccountNameForm({ creatorName }: { creatorName: string }) {
  const [state, formAction] = useActionState(updateCreatorName, initialState);
  const [fullName, setFullName] = useState(creatorName);
  const error = state.fieldErrors?.fullName;

  return (
    <form action={formAction} className={styles.form}>
      {state.error ? <SettingsStatus message={state.error} tone="danger" /> : null}
      {state.notice ? <SettingsStatus message={state.notice} tone="success" /> : null}

      <div className={authStyles.field}>
        <label htmlFor="settings-full-name">Your name</label>
        <input
          aria-describedby={error ? "settings-full-name-error" : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="name"
          id="settings-full-name"
          maxLength={120}
          name="fullName"
          onChange={(event) => setFullName(event.target.value)}
          required
          type="text"
          value={fullName}
        />
        <FieldError id="settings-full-name-error" message={error} />
      </div>

      <div className={styles.formActions}>
        <PendingFormButton
          className={styles.submitButton ?? ""}
          idleContent="Save name"
          pendingContent="Saving…"
          type="submit"
        />
      </div>
    </form>
  );
}
