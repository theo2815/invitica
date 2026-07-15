"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { BrandMark } from "../BrandMark";
import styles from "./AuthPage.module.css";

type AuthMode = "login" | "register";

type AuthActionState = {
  error: string | null;
};

type EmailAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;

interface AuthPageProps {
  emailAction: EmailAction;
  googleAction: (formData: FormData) => Promise<void>;
  initialError?: string | undefined;
  mode: AuthMode;
}

const initialState: AuthActionState = { error: null };

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

function SubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button className={styles.primaryButton} disabled={pending} type="submit">
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

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

export function AuthPage({ emailAction, googleAction, initialError, mode }: AuthPageProps) {
  const copy = pageCopy[mode];
  const [state, formAction] = useActionState(emailAction, {
    ...initialState,
    error: initialError ?? null,
  });
  const headingId = `${mode}-heading`;
  const errorId = `${mode}-form-error`;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>
        <span className={styles.headerNote}>Invitations, thoughtfully made</span>
      </header>

      <div className={styles.layout}>
        <section aria-labelledby={`${mode}-story-heading`} className={styles.story}>
          <p className={styles.storyLabel}>A beautiful beginning</p>
          <h2 id={`${mode}-story-heading`}>{copy.storyHeading}</h2>
          <p>{copy.story}</p>
          <div aria-hidden="true" className={styles.storyRule}>
            <span />
          </div>
        </section>

        <section aria-labelledby={headingId} className={styles.panel}>
          <div className={styles.panelHeading}>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1 id={headingId}>{copy.heading}</h1>
            <p>{copy.description}</p>
          </div>

          <form action={googleAction} aria-label="Continue with Google">
            <GoogleButton />
          </form>

          <div aria-hidden="true" className={styles.divider}>
            <span>or continue with email</span>
          </div>

          <form
            action={formAction}
            aria-describedby={state.error ? errorId : undefined}
            aria-label={copy.formLabel}
            className={styles.form}
          >
            {mode === "register" ? (
              <div className={styles.field}>
                <label htmlFor="full-name">Full name</label>
                <input
                  autoComplete="name"
                  id="full-name"
                  maxLength={120}
                  minLength={2}
                  name="fullName"
                  required
                  type="text"
                />
              </div>
            ) : null}

            <div className={styles.field}>
              <label htmlFor={`${mode}-email`}>Email address</label>
              <input
                autoComplete="email"
                id={`${mode}-email`}
                inputMode="email"
                name="email"
                required
                type="email"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor={`${mode}-password`}>Password</label>
              <input
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                id={`${mode}-password`}
                maxLength={128}
                minLength={mode === "register" ? 8 : undefined}
                name="password"
                required
                type="password"
              />
            </div>

            {mode === "register" ? (
              <div className={styles.field}>
                <label htmlFor="confirm-password">Confirm password</label>
                <input
                  autoComplete="new-password"
                  id="confirm-password"
                  maxLength={128}
                  minLength={8}
                  name="confirmPassword"
                  required
                  type="password"
                />
              </div>
            ) : null}

            {state.error ? (
              <p className={styles.error} id={errorId} role="alert">
                {state.error}
              </p>
            ) : null}

            <SubmitButton idleLabel={copy.emailSubmit} pendingLabel={copy.emailPending} />
          </form>

          <p className={styles.alternate}>
            {copy.alternate} <Link href={copy.alternateHref}>{copy.alternateAction}</Link>
          </p>
        </section>
      </div>
    </main>
  );
}

export function CheckEmailPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>
        <span className={styles.headerNote}>Invitations, thoughtfully made</span>
      </header>
      <div className={styles.noticeLayout}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <p className={styles.eyebrow}>Confirm your email</p>
            <h1>Check your inbox</h1>
            <p>
              We sent a confirmation link to the email address you provided. Open it to finish
              creating your Invitica account.
            </p>
          </div>
          <p className={styles.notice}>
            You can close this page after opening the confirmation link.
          </p>
          <p className={styles.alternate}>
            <Link href="/login">Back to sign in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
