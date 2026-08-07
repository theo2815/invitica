"use client";

import { useActionState, useState } from "react";

import { changeEmailAddress } from "../../server/account/actions";
import type { AuthActionState } from "../../server/auth/types";
import { FieldError } from "../auth/AuthFormFields";
import authStyles from "../auth/AuthPage.module.css";
import { PendingFormButton } from "../feedback/PendingFormButton";
import styles from "./Settings.module.css";
import { SettingsStatus } from "./SettingsSection";

const initialState: AuthActionState = { error: null };

/**
 * Requests an email change. Nothing is applied here.
 *
 * Supabase writes the new address only after the links in **both** inboxes are followed, so the
 * creator keeps signing in with their current address until then. The success wording says so
 * rather than reporting a change that has not happened — the failure mode otherwise is a creator
 * who believes their address has moved, cannot sign in with it, and has no reason to check the
 * old inbox.
 */
export function AccountEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction] = useActionState(changeEmailAddress, initialState);
  const [email, setEmail] = useState("");
  const error = state.fieldErrors?.email;

  return (
    <form action={formAction} className={styles.form}>
      {state.error ? <SettingsStatus message={state.error} tone="danger" /> : null}
      {state.notice ? <SettingsStatus message={state.notice} tone="success" /> : null}

      <p className={styles.inlineNote}>
        You currently sign in with <strong>{currentEmail}</strong>.
      </p>

      <div className={authStyles.field}>
        <label htmlFor="settings-email">New email address</label>
        <input
          aria-describedby={error ? "settings-email-error" : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="email"
          id="settings-email"
          inputMode="email"
          maxLength={254}
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <FieldError id="settings-email-error" message={error} />
      </div>

      <div className={styles.formActions}>
        <PendingFormButton
          className={styles.submitButton ?? ""}
          idleContent="Send confirmation links"
          pendingContent="Sending…"
          type="submit"
        />
      </div>
    </form>
  );
}
