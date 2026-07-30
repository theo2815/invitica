"use client";

import Link from "next/link";
import { type FormEvent, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { AuthActionState, AuthFieldErrors, AuthFieldName } from "../../server/auth/types";
import { validateEmailLogin, validateEmailRegistration } from "../../server/auth/validation";
import { TermsAcceptanceField } from "../legal/TermsAcceptanceField";
import { FieldError, PasswordField, PendingButton } from "./AuthFormFields";
import styles from "./AuthPage.module.css";
import { AuthShell } from "./AuthShell";

type AuthMode = "login" | "register";

type EmailAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;

interface AuthPageProps {
  /** When true (production beta), hide account creation, Google sign-in, and password recovery. */
  betaLocked?: boolean;
  emailAction: EmailAction;
  googleAction: (formData: FormData) => Promise<void>;
  initialError?: string | undefined;
  initialNotice?: string | undefined;
  legalAcceptanceRequired?: boolean;
  mode: AuthMode;
  nextPath?: string | undefined;
}

interface AuthValues {
  confirmPassword: string;
  email: string;
  fullName: string;
  password: string;
}

const pageCopy = {
  login: {
    eyebrow: "Creator studio",
    heading: "Welcome back",
    description: "Return to the invitations and celebrations you are bringing to life.",
    storyHeading: "Your thoughtful details are waiting.",
    story:
      "Continue shaping a celebration that feels personal from the first opening to the final note.",
    emailSubmit: "Sign in",
    emailPending: "Signing in…",
    formLabel: "Sign in with email",
    alternate: "New to Invitica?",
    alternateAction: "Create an account",
    alternateHref: "/register",
  },
  register: {
    eyebrow: "Begin creating",
    heading: "Create your account",
    description:
      "Start with an invitation that feels considered, personal, and unmistakably yours.",
    storyHeading: "Make the first impression part of the celebration.",
    story:
      "Bring your story, event details, and guest experience together in one beautifully composed invitation.",
    emailSubmit: "Create account",
    emailPending: "Creating account…",
    formLabel: "Create an account with email",
    alternate: "Already have an account?",
    alternateAction: "Sign in",
    alternateHref: "/login",
  },
} as const;

const initialValues: AuthValues = {
  confirmPassword: "",
  email: "",
  fullName: "",
  password: "",
};

function GoogleButton() {
  const { pending } = useFormStatus();

  return (
    <button className={styles.googleButton} disabled={pending} type="submit">
      <svg aria-hidden="true" className={styles.googleMark} viewBox="0 0 24 24">
        <path
          d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.5a4.8 4.8 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z"
          fill="#4285F4"
        />
        <path
          d="M12 22c2.7 0 5-.9 6.8-2.3l-3.3-2.6c-.9.6-2.1 1-3.5 1a6 6 0 0 1-5.7-4.1H2.9v2.7A10.2 10.2 0 0 0 12 22Z"
          fill="#34A853"
        />
        <path d="M6.3 14a6.2 6.2 0 0 1 0-4V7.3H2.9a10.2 10.2 0 0 0 0 9.4L6.3 14Z" fill="#FBBC05" />
        <path
          d="M12 5.9c1.6 0 3 .5 4.1 1.6l3.1-3.1A10.2 10.2 0 0 0 2.9 7.3L6.3 10A6 6 0 0 1 12 5.9Z"
          fill="#EA4335"
        />
      </svg>
      {pending ? "Connecting…" : "Continue with Google"}
    </button>
  );
}

function focusFirstError(fieldErrors: AuthFieldErrors, mode: AuthMode) {
  const order: AuthFieldName[] =
    mode === "register"
      ? ["fullName", "email", "password", "confirmPassword", "termsAccepted"]
      : ["email", "password"];
  const firstInvalid = order.find((name) => fieldErrors[name]);

  if (firstInvalid) {
    document
      .getElementById(
        firstInvalid === "fullName"
          ? "full-name"
          : firstInvalid === "confirmPassword"
            ? "confirm-password"
            : firstInvalid === "termsAccepted"
              ? "register-terms-accepted"
              : `${mode}-${firstInvalid}`,
      )
      ?.focus();
  }
}

export function AuthPage({
  betaLocked,
  emailAction,
  googleAction,
  initialError,
  initialNotice,
  legalAcceptanceRequired = false,
  mode,
  nextPath,
}: AuthPageProps) {
  const copy = pageCopy[mode];
  const [state, formAction] = useActionState(emailAction, {
    error: initialError ?? null,
    notice: initialNotice ?? null,
  });
  const [clientErrors, setClientErrors] = useState<AuthFieldErrors>({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [values, setValues] = useState<AuthValues>(initialValues);
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };
  if (termsAccepted) {
    delete fieldErrors.termsAccepted;
  }
  const headingId = `${mode}-heading`;
  const errorId = `${mode}-form-error`;
  const alternateHref = nextPath
    ? `${copy.alternateHref}?next=${encodeURIComponent(nextPath)}`
    : copy.alternateHref;

  function updateValue(name: keyof AuthValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setClientErrors((current) => {
      if (!current[name]) {
        return current;
      }
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result =
      mode === "register"
        ? validateEmailRegistration(new FormData(event.currentTarget), {
            requireTermsAcceptance: legalAcceptanceRequired,
          })
        : validateEmailLogin(new FormData(event.currentTarget));

    if (!result.ok) {
      event.preventDefault();
      setClientErrors(result.fieldErrors);
      focusFirstError(result.fieldErrors, mode);
      return;
    }

    setClientErrors({});
  }

  return (
    <AuthShell
      description={copy.description}
      eyebrow={copy.eyebrow}
      heading={copy.heading}
      headingId={headingId}
      story={{
        heading: copy.storyHeading,
        label: "A beautiful beginning",
        text: copy.story,
      }}
    >
      {betaLocked ? null : (
        <>
          {legalAcceptanceRequired ? (
            <p className={styles.googleLegalNotice}>
              Google sign-in returns you to Invitica. If this account has not accepted the current
              documents, you will review them before entering the creator studio. Read the{" "}
              <Link href="/terms" rel="noreferrer" target="_blank">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" rel="noreferrer" target="_blank">
                Privacy Notice
              </Link>
              .
            </p>
          ) : null}
          <form action={googleAction} aria-label="Continue with Google">
            {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}
            <GoogleButton />
          </form>

          <div aria-hidden="true" className={styles.divider}>
            <span>or continue with email</span>
          </div>
        </>
      )}

      <form
        action={formAction}
        aria-describedby={state.error ? errorId : undefined}
        aria-label={copy.formLabel}
        className={styles.form}
        noValidate
        onSubmit={handleSubmit}
      >
        {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}
        {mode === "register" ? (
          <div className={styles.field}>
            <label htmlFor="full-name">Full name</label>
            <input
              aria-describedby={fieldErrors.fullName ? "full-name-error" : undefined}
              aria-invalid={fieldErrors.fullName ? true : undefined}
              autoComplete="name"
              id="full-name"
              maxLength={120}
              minLength={2}
              name="fullName"
              onChange={(event) => updateValue("fullName", event.target.value)}
              required
              type="text"
              value={values.fullName}
            />
            <FieldError id="full-name-error" message={fieldErrors.fullName} />
          </div>
        ) : null}

        <div className={styles.field}>
          <label htmlFor={`${mode}-email`}>Email address</label>
          <input
            aria-describedby={fieldErrors.email ? `${mode}-email-error` : undefined}
            aria-invalid={fieldErrors.email ? true : undefined}
            autoComplete="email"
            id={`${mode}-email`}
            inputMode="email"
            maxLength={254}
            name="email"
            onChange={(event) => updateValue("email", event.target.value)}
            required
            type="email"
            value={values.email}
          />
          <FieldError id={`${mode}-email-error`} message={fieldErrors.email} />
        </div>

        <PasswordField
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          error={fieldErrors.password}
          id={`${mode}-password`}
          label="Password"
          labelAction={
            mode === "login" && !betaLocked ? (
              <Link className={styles.fieldLink} href="/forgot-password">
                Forgot password?
              </Link>
            ) : undefined
          }
          name="password"
          onChange={(value) => updateValue("password", value)}
          value={values.password}
        />

        {mode === "register" ? (
          <>
            <PasswordField
              autoComplete="new-password"
              error={fieldErrors.confirmPassword}
              id="confirm-password"
              label="Confirm password"
              name="confirmPassword"
              onChange={(value) => updateValue("confirmPassword", value)}
              value={values.confirmPassword}
            />
            {legalAcceptanceRequired ? (
              <TermsAcceptanceField
                checked={termsAccepted}
                error={fieldErrors.termsAccepted}
                id="register-terms-accepted"
                onChange={(checked) => {
                  setTermsAccepted(checked);
                  if (checked) {
                    setClientErrors((current) => {
                      const next = { ...current };
                      delete next.termsAccepted;
                      return next;
                    });
                  }
                }}
              />
            ) : null}
          </>
        ) : null}

        {state.error ? (
          <p className={styles.error} id={errorId} role="alert">
            {state.error}
          </p>
        ) : null}

        {state.notice ? (
          <p className={styles.success} role="status">
            {state.notice}
          </p>
        ) : null}

        <PendingButton idleLabel={copy.emailSubmit} pendingLabel={copy.emailPending} />
      </form>

      {betaLocked ? null : (
        <p className={styles.alternate}>
          {copy.alternate} <Link href={alternateHref}>{copy.alternateAction}</Link>
        </p>
      )}
    </AuthShell>
  );
}

export function CheckEmailPage() {
  return (
    <AuthShell
      description="We sent a confirmation link to the email address you provided. Open it to finish creating your Invitica account."
      eyebrow="Confirm your email"
      heading="Check your inbox"
      headingId="check-email-heading"
    >
      <p className={styles.notice}>You can close this page after opening the confirmation link.</p>
      <p className={styles.alternate}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
