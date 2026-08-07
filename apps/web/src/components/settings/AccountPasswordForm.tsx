"use client";

import { useActionState, useEffect, useState } from "react";

import { changePassword } from "../../server/account/actions";
import type { AuthActionState } from "../../server/auth/types";
import { PasswordField } from "../auth/AuthFormFields";
import { PendingFormButton } from "../feedback/PendingFormButton";
import styles from "./Settings.module.css";
import { SettingsStatus } from "./SettingsSection";

const initialState: AuthActionState = { error: null };

/**
 * Changing a password from inside the account, which the deployed site has no other path to.
 *
 * `updatePassword` in `server/auth/actions.ts` requires a verified recovery code, and
 * `requestPasswordReset` is closed by `publicAuthLocked()` in production — so before this
 * existed, a signed-in creator on invitica.app could not change their password at all.
 *
 * All three fields are controlled and cleared only on success. A creator who mistypes their
 * current password should not have to retype the new one twice as well.
 */
export function AccountPasswordForm() {
  const [state, formAction] = useActionState(changePassword, initialState);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!state.notice) return;
    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
  }, [state.notice]);

  return (
    <form action={formAction} className={styles.form}>
      {state.error ? <SettingsStatus message={state.error} tone="danger" /> : null}
      {state.notice ? <SettingsStatus message={state.notice} tone="success" /> : null}

      <PasswordField
        autoComplete="current-password"
        error={state.fieldErrors?.currentPassword}
        id="settings-current-password"
        label="Current password"
        name="currentPassword"
        onChange={setCurrentPassword}
        value={currentPassword}
      />

      <PasswordField
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        id="settings-new-password"
        label="New password"
        name="password"
        onChange={setPassword}
        value={password}
      />

      <PasswordField
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
        id="settings-confirm-password"
        label="Confirm new password"
        name="confirmPassword"
        onChange={setConfirmPassword}
        value={confirmPassword}
      />

      <div className={styles.formActions}>
        <PendingFormButton
          className={styles.submitButton ?? ""}
          idleContent="Change password"
          pendingContent="Changing…"
          type="submit"
        />
      </div>
    </form>
  );
}
