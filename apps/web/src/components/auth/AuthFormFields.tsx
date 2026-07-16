"use client";

import { type ReactNode, useState } from "react";
import { useFormStatus } from "react-dom";

import styles from "./AuthPage.module.css";

interface FieldErrorProps {
  id: string;
  message?: string | undefined;
}

interface PasswordFieldProps {
  autoComplete: "current-password" | "new-password";
  error?: string | undefined;
  id: string;
  label: string;
  labelAction?: ReactNode | undefined;
  name: "confirmPassword" | "password";
  onChange: (value: string) => void;
  value: string;
}

export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <p className={styles.fieldError} id={id}>
      {message}
    </p>
  );
}

export function PendingButton({
  idleLabel,
  pendingLabel,
}: {
  idleLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={styles.primaryButton} disabled={pending} type="submit">
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function PasswordField({
  autoComplete,
  error,
  id,
  label,
  labelAction,
  name,
  onChange,
  value,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  const actionLabel = `${visible ? "Hide" : "Show"} ${label.toLowerCase()}`;

  return (
    <div className={styles.field}>
      <div className={styles.fieldLabelRow}>
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <div className={styles.passwordControl}>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete}
          id={id}
          maxLength={128}
          minLength={autoComplete === "new-password" ? 8 : undefined}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={actionLabel}
          aria-pressed={visible}
          className={styles.passwordToggle}
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <path
              d="M2.8 12s3.2-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.2 5.5-9.2 5.5S2.8 12 2.8 12Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
            <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
            {visible ? (
              <path d="m4 4 16 16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
            ) : null}
          </svg>
        </button>
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
