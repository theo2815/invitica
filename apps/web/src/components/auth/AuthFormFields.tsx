"use client";

import { type ReactNode, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  generatePassword,
  PASSWORD_MIN_LENGTH,
  type PasswordAssessment,
} from "../../server/auth/password-strength";
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
  // `currentPassword` is the settings re-verification field. The control itself is unchanged:
  // the show/hide toggle, the `aria-invalid`/`aria-describedby` wiring, and the 44 px target
  // are the reason settings reuses this rather than writing a third password input.
  name: "confirmPassword" | "currentPassword" | "password";
  onChange: (value: string) => void;
  /** Supply on a password being *set* to show the meter and requirement list beneath the input. */
  strength?: PasswordAssessment | undefined;
  value: string;
  // Show/hide is the field's own state unless a parent needs to drive it. The generator does: a
  // password filled in as dots is one nobody can write down, and both fields receive it at once.
  onVisibleChange?: ((visible: boolean) => void) | undefined;
  visible?: boolean | undefined;
}

const STRENGTH_LABELS: Record<PasswordAssessment["strength"], string> = {
  fair: "Fair",
  good: "Good",
  strong: "Strong",
  weak: "Weak",
};

/**
 * The bar, the word, and the three requirements — never the bar alone. The word carries the same
 * information for anyone who cannot separate the colours, and `role="status"` announces it only
 * when the band actually changes rather than on every keystroke.
 */
export function PasswordStrengthMeter({
  assessment,
  id,
}: {
  assessment: PasswordAssessment;
  id: string;
}) {
  return (
    <div className={styles.strength} id={id}>
      <div aria-hidden="true" className={styles.strengthTrack}>
        <span className={styles.strengthBar} data-score={assessment.score} />
      </div>
      <p className={styles.strengthLabel} role="status">
        Password strength: <strong>{STRENGTH_LABELS[assessment.strength]}</strong>
      </p>
      <ul className={styles.strengthList}>
        {assessment.requirements.map((requirement) => (
          <li data-met={requirement.met} key={requirement.id}>
            <span aria-hidden="true">{requirement.met ? "✓" : "•"}</span>
            {requirement.label}
          </li>
        ))}
      </ul>
      {assessment.tip ? <p className={styles.strengthTip}>{assessment.tip}</p> : null}
    </div>
  );
}

/**
 * Fills both the password and the confirm field with a generated phrase.
 *
 * Safari and Chrome already offer one on an `autocomplete="new-password"` field, and a creator with
 * a password manager should take theirs. This exists for the creator who has none and would
 * otherwise reuse a password from somewhere else — the single most common way these accounts are
 * lost. The value is revealed after it is filled, because a password nobody can read is a password
 * nobody saves.
 */
export function GeneratePasswordButton({ onGenerate }: { onGenerate: (password: string) => void }) {
  return (
    <button
      className={styles.generateButton}
      onClick={() => onGenerate(generatePassword())}
      type="button"
    >
      Suggest a strong password
    </button>
  );
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
  onVisibleChange,
  strength,
  value,
  visible: controlledVisible,
}: PasswordFieldProps) {
  const [ownVisible, setOwnVisible] = useState(false);
  const visible = controlledVisible ?? ownVisible;
  const setVisible = (next: boolean) => {
    setOwnVisible(next);
    onVisibleChange?.(next);
  };
  const errorId = `${id}-error`;
  const strengthId = `${id}-strength`;
  const actionLabel = `${visible ? "Hide" : "Show"} ${label.toLowerCase()}`;
  // Both when both exist: the requirement list explains the refusal the error names.
  const describedBy =
    [error ? errorId : null, strength && value ? strengthId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={styles.field}>
      <div className={styles.fieldLabelRow}>
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <div className={styles.passwordControl}>
        <input
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete}
          id={id}
          maxLength={128}
          minLength={autoComplete === "new-password" ? PASSWORD_MIN_LENGTH : undefined}
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
          onClick={() => setVisible(!visible)}
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
      {strength && value ? <PasswordStrengthMeter assessment={strength} id={strengthId} /> : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
