"use client";

import Link from "next/link";
import { type FormEvent, useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import type { AuthActionState, AuthFieldErrors } from "../../server/auth/types";
import {
  validatePasswordUpdate,
  validateRecoveryCode,
  validateRecoveryEmail,
} from "../../server/auth/validation";
import { FieldError, PasswordField, PendingButton } from "./AuthFormFields";
import styles from "./AuthPage.module.css";
import { AuthShell } from "./AuthShell";

type AuthAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;

const recoveryStory = {
  heading: "A careful way back to your invitations.",
  label: "Account recovery",
  text: "Verify your email privately, choose a new password, and return to your creator workspace.",
};

function FormFeedback({ state }: { state: AuthActionState }) {
  return (
    <>
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p className={styles.success} role="status">
          {state.notice}
        </p>
      ) : null}
    </>
  );
}

export function ForgotPasswordPage({ action }: { action: AuthAction }) {
  const [state, formAction] = useActionState(action, { error: null });
  const [email, setEmail] = useState("");
  const [clientErrors, setClientErrors] = useState<AuthFieldErrors>({});
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateRecoveryEmail(new FormData(event.currentTarget));

    if (!result.ok) {
      event.preventDefault();
      setClientErrors(result.fieldErrors);
      document.getElementById("recovery-email")?.focus();
      return;
    }

    setClientErrors({});
  }

  return (
    <AuthShell
      description="Enter the email address connected to your account. We will send a private recovery code."
      eyebrow="Forgot password"
      heading="Reset your password"
      headingId="forgot-password-heading"
      story={recoveryStory}
    >
      <form
        action={formAction}
        aria-label="Request a password recovery code"
        className={styles.formWithTopMargin}
        noValidate
        onSubmit={handleSubmit}
      >
        <div className={styles.field}>
          <label htmlFor="recovery-email">Email address</label>
          <input
            aria-describedby={fieldErrors.email ? "recovery-email-error" : undefined}
            aria-invalid={fieldErrors.email ? true : undefined}
            autoComplete="email"
            id="recovery-email"
            inputMode="email"
            maxLength={254}
            name="email"
            onChange={(event) => {
              setEmail(event.target.value);
              setClientErrors({});
            }}
            required
            type="email"
            value={email}
          />
          <FieldError id="recovery-email-error" message={fieldErrors.email} />
        </div>
        <FormFeedback state={state} />
        <PendingButton idleLabel="Send recovery code" pendingLabel="Sending code…" />
      </form>
      <p className={styles.alternate}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}

function ResendButton({ cooldown }: { cooldown: number }) {
  const { pending } = useFormStatus();
  const disabled = pending || cooldown > 0;
  const label = pending
    ? "Sending another code…"
    : cooldown > 0
      ? `Send another code in ${cooldown}s`
      : "Send another code";

  return (
    <button className={styles.secondaryButton} disabled={disabled} type="submit">
      {label}
    </button>
  );
}

export function VerifyRecoveryPage({
  action,
  resendAction,
}: {
  action: AuthAction;
  resendAction: AuthAction;
}) {
  const [state, formAction] = useActionState(action, { error: null });
  const [resendState, resendFormAction] = useActionState(resendAction, { error: null });
  const [otp, setOtp] = useState("");
  const [clientErrors, setClientErrors] = useState<AuthFieldErrors>({});
  const [cooldown, setCooldown] = useState(60);
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (resendState.notice) {
      setCooldown(60);
    }
  }, [resendState.notice]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateRecoveryCode(new FormData(event.currentTarget));

    if (!result.ok) {
      event.preventDefault();
      setClientErrors(result.fieldErrors);
      document.getElementById("recovery-code")?.focus();
      return;
    }

    setClientErrors({});
  }

  return (
    <AuthShell
      description="Enter the six-digit code from the most recent password-recovery email."
      eyebrow="Verify your email"
      heading="Check your inbox"
      headingId="verify-recovery-heading"
      story={recoveryStory}
    >
      <p className={styles.privacyNotice}>
        If an Invitica account exists for that email address, a recovery code is on its way.
      </p>
      <form
        action={formAction}
        aria-label="Verify password recovery code"
        className={styles.formWithTopMargin}
        noValidate
        onSubmit={handleSubmit}
      >
        <div className={styles.field}>
          <label htmlFor="recovery-code">Recovery code</label>
          <input
            aria-describedby={fieldErrors.otp ? "recovery-code-error" : "recovery-code-hint"}
            aria-invalid={fieldErrors.otp ? true : undefined}
            autoComplete="one-time-code"
            className={styles.otpInput}
            id="recovery-code"
            inputMode="numeric"
            maxLength={6}
            name="otp"
            onChange={(event) => {
              setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
              setClientErrors({});
            }}
            pattern="[0-9]{6}"
            required
            type="text"
            value={otp}
          />
          <p className={styles.fieldHint} id="recovery-code-hint">
            Codes expire for your protection. You can paste the complete code.
          </p>
          <FieldError id="recovery-code-error" message={fieldErrors.otp} />
        </div>
        <FormFeedback state={state} />
        <PendingButton idleLabel="Verify code" pendingLabel="Verifying code…" />
      </form>

      <form action={resendFormAction} className={styles.resendForm}>
        <ResendButton cooldown={cooldown} />
      </form>
      <FormFeedback state={resendState} />
      <p className={styles.alternate}>
        <Link href="/forgot-password">Use a different email address</Link>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordPage({ action }: { action: AuthAction }) {
  const [state, formAction] = useActionState(action, { error: null });
  const [values, setValues] = useState({ confirmPassword: "", password: "" });
  const [clientErrors, setClientErrors] = useState<AuthFieldErrors>({});
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };

  function updateValue(name: "confirmPassword" | "password", value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setClientErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validatePasswordUpdate(new FormData(event.currentTarget));

    if (!result.ok) {
      event.preventDefault();
      setClientErrors(result.fieldErrors);
      const firstId = result.fieldErrors.password ? "new-password" : "confirm-new-password";
      document.getElementById(firstId)?.focus();
      return;
    }

    setClientErrors({});
  }

  return (
    <AuthShell
      description="Use at least eight characters. Choose something unique to your Invitica account."
      eyebrow="Secure your account"
      heading="Choose a new password"
      headingId="reset-password-heading"
      story={recoveryStory}
    >
      <form
        action={formAction}
        aria-label="Choose a new password"
        className={styles.formWithTopMargin}
        noValidate
        onSubmit={handleSubmit}
      >
        <PasswordField
          autoComplete="new-password"
          error={fieldErrors.password}
          id="new-password"
          label="New password"
          name="password"
          onChange={(value) => updateValue("password", value)}
          value={values.password}
        />
        <PasswordField
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          id="confirm-new-password"
          label="Confirm new password"
          name="confirmPassword"
          onChange={(value) => updateValue("confirmPassword", value)}
          value={values.confirmPassword}
        />
        <FormFeedback state={state} />
        <PendingButton idleLabel="Change password" pendingLabel="Changing password…" />
      </form>
    </AuthShell>
  );
}
