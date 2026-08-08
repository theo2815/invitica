"use client";

import Link from "next/link";
import { type FormEvent, useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { assessPassword } from "../../server/auth/password-strength";
import type { AuthActionState, AuthFieldErrors } from "../../server/auth/types";
import {
  validatePasswordUpdate,
  validateRecoveryCode,
  validateRecoveryEmail,
} from "../../server/auth/validation";
import { FieldError, GeneratePasswordButton, PasswordField, PendingButton } from "./AuthFormFields";
import styles from "./AuthPage.module.css";
import { AuthShell } from "./AuthShell";
import { LegalFooter } from "./LegalFooter";
import {
  CAPTCHA_FIELD_ID,
  CaptchaTokenInput,
  TurnstileField,
  useTurnstile,
} from "./TurnstileField";

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
  const turnstile = useTurnstile();
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };
  if (turnstile.token) {
    delete fieldErrors.captchaToken;
  }

  // A single-use token is spent or refused on every action result, so a fresh one has to be
  // minted. The effect runs *on* a new result rather than reading one, hence the dependency.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional run-on-change trigger
  useEffect(() => {
    turnstile.reset();
  }, [state, turnstile.reset]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateRecoveryEmail(new FormData(event.currentTarget), {
      requireCaptcha: turnstile.required,
    });

    if (!result.ok) {
      event.preventDefault();
      setClientErrors(result.fieldErrors);
      document
        .getElementById(result.fieldErrors.email ? "recovery-email" : CAPTCHA_FIELD_ID)
        ?.focus();
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
        <TurnstileField error={fieldErrors.captchaToken} instance={turnstile} />
        <FormFeedback state={state} />
        <PendingButton idleLabel="Send recovery code" pendingLabel="Sending code…" />
      </form>
      <p className={styles.alternate}>
        <Link href="/login">Back to sign in</Link>
      </p>
      <LegalFooter />
    </AuthShell>
  );
}

/**
 * The resend form has no fields of its own, so there is nothing to validate on submit and no place
 * to put an error. It is disabled until the shared challenge is solved instead — the one case on
 * these pages where a control waits on Turnstile rather than reporting it afterwards.
 */
function ResendButton({ cooldown, disabled }: { cooldown: number; disabled: boolean }) {
  const { pending } = useFormStatus();
  const label = pending
    ? "Sending another code…"
    : cooldown > 0
      ? `Send another code in ${cooldown}s`
      : disabled
        ? "Complete the verification first"
        : "Send another code";

  return (
    <button
      className={styles.secondaryButton}
      disabled={pending || cooldown > 0 || disabled}
      type="submit"
    >
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
  // One challenge for both forms. A Turnstile token is single-use, so mounting a second widget for
  // "Send another code" would put two challenges on a page whose whole job is one six-digit code.
  const turnstile = useTurnstile();
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };
  if (turnstile.token) {
    delete fieldErrors.captchaToken;
  }

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

  // A single-use token is spent or refused on every action result, so a fresh one has to be
  // minted. The effect runs *on* a new result rather than reading one, hence the dependency.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional run-on-change trigger
  useEffect(() => {
    turnstile.reset();
  }, [state, resendState, turnstile.reset]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateRecoveryCode(new FormData(event.currentTarget), {
      requireCaptcha: turnstile.required,
    });

    if (!result.ok) {
      event.preventDefault();
      setClientErrors(result.fieldErrors);
      document.getElementById(result.fieldErrors.otp ? "recovery-code" : CAPTCHA_FIELD_ID)?.focus();
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
        <TurnstileField error={fieldErrors.captchaToken} instance={turnstile} />
        <FormFeedback state={state} />
        <PendingButton idleLabel="Verify code" pendingLabel="Verifying code…" />
      </form>

      <form action={resendFormAction} className={styles.resendForm}>
        <CaptchaTokenInput instance={turnstile} />
        <ResendButton cooldown={cooldown} disabled={turnstile.required && !turnstile.token} />
      </form>
      <FormFeedback state={resendState} />
      <p className={styles.alternate}>
        <Link href="/forgot-password">Use a different email address</Link>
      </p>
      <LegalFooter />
    </AuthShell>
  );
}

export function ResetPasswordPage({ action }: { action: AuthAction }) {
  const [state, formAction] = useActionState(action, { error: null });
  const [values, setValues] = useState({ confirmPassword: "", password: "" });
  const [clientErrors, setClientErrors] = useState<AuthFieldErrors>({});
  const [passwordVisible, setPasswordVisible] = useState(false);
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };
  // No name or email to compare against here: this form is reached by a verified recovery code and
  // carries neither. The length and blocklist rules still apply.
  const strength = assessPassword(values.password);

  function updateValue(name: "confirmPassword" | "password", value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setClientErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function useGeneratedPassword(password: string) {
    setValues({ confirmPassword: password, password });
    setClientErrors({});
    setPasswordVisible(true);
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
      description="Choose something unique to your Invitica account. A phrase of a few unrelated words is easier to remember and harder to guess."
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
          labelAction={<GeneratePasswordButton onGenerate={useGeneratedPassword} />}
          name="password"
          onChange={(value) => updateValue("password", value)}
          onVisibleChange={setPasswordVisible}
          strength={strength}
          value={values.password}
          visible={passwordVisible}
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
      <LegalFooter />
    </AuthShell>
  );
}
