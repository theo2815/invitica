"use client";

import Link from "next/link";

import { FieldError } from "../auth/AuthFormFields";
import styles from "../auth/AuthPage.module.css";

interface TermsAcceptanceFieldProps {
  checked: boolean;
  error?: string | undefined;
  id: string;
  onChange: (checked: boolean) => void;
}

export function TermsAcceptanceField({ checked, error, id, onChange }: TermsAcceptanceFieldProps) {
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = error ? `${descriptionId} ${errorId}` : descriptionId;

  return (
    <div className={styles.consentField}>
      <div className={styles.consentControl}>
        <input
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          checked={checked}
          id={id}
          name="termsAccepted"
          onChange={(event) => onChange(event.target.checked)}
          required
          type="checkbox"
          value="yes"
        />
        <label htmlFor={id}>
          I agree to the current Terms of Service and acknowledge the Privacy Notice.
        </label>
      </div>
      <p className={styles.consentDescription} id={descriptionId}>
        Review the{" "}
        <Link href="/terms" rel="noreferrer" target="_blank">
          Terms of Service <span className={styles.visuallyHidden}>(opens in a new tab)</span>
        </Link>{" "}
        and{" "}
        <Link href="/privacy" rel="noreferrer" target="_blank">
          Privacy Notice <span className={styles.visuallyHidden}>(opens in a new tab)</span>
        </Link>
        .
      </p>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
