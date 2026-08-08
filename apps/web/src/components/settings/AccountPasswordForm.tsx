"use client";

import { useActionState, useEffect, useState } from "react";

import { changePassword } from "../../server/account/actions";
import { assessPassword } from "../../server/auth/password-strength";
import type { AuthActionState } from "../../server/auth/types";
import { GeneratePasswordButton, PasswordField } from "../auth/AuthFormFields";
import { TurnstileField, useTurnstile } from "../auth/TurnstileField";
import { PendingFormButton } from "../feedback/PendingFormButton";
import styles from "./Settings.module.css";
import { SettingsStatus } from "./SettingsSection";

const initialState: AuthActionState = { error: null };

/**
 * Changing a password from inside the account.
 *
 * `updatePassword` in `server/auth/actions.ts` requires a verified recovery code, so this is the
 * only path for a creator who still knows their password and simply wants a different one.
 *
 * **This form carries a Turnstile challenge and the other Settings panels do not**, because
 * `changePassword` re-verifies the current password through `signInWithPassword` — the same
 * endpoint the sign-in form uses, and one Supabase's project-wide CAPTCHA toggle protects. Without
 * a token here, enabling that toggle would make every password change report "That is not your
 * current password" for a password that was correct.
 *
 * All three fields are controlled and cleared only on success. A creator who mistypes their
 * current password should not have to retype the new one twice as well.
 */
export function AccountPasswordForm() {
  const [state, formAction] = useActionState(changePassword, initialState);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const turnstile = useTurnstile();

  useEffect(() => {
    if (!state.notice) return;
    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
    setPasswordVisible(false);
  }, [state.notice]);

  // A single-use token is spent or refused on every action result, so a fresh one has to be
  // minted. The effect runs *on* a new result rather than reading one, hence the dependency.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional run-on-change trigger
  useEffect(() => {
    turnstile.reset();
  }, [state, turnstile.reset]);

  function useGeneratedPassword(generated: string) {
    setPassword(generated);
    setConfirmPassword(generated);
    setPasswordVisible(true);
  }

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
        labelAction={<GeneratePasswordButton onGenerate={useGeneratedPassword} />}
        name="password"
        onChange={setPassword}
        onVisibleChange={setPasswordVisible}
        strength={assessPassword(password)}
        value={password}
        visible={passwordVisible}
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

      <TurnstileField error={state.fieldErrors?.captchaToken} instance={turnstile} />

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
