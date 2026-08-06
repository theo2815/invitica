import styles from "./TalaMascot.module.css";

export type TalaState = "attention" | "attentive" | "idle" | "responding" | "success" | "thinking";

interface TalaMascotProps {
  className?: string | undefined;
  size?: "compact" | "standard" | undefined;
  state: TalaState;
}

interface TalaStateInput {
  active: boolean;
  hasNotice: boolean;
  hasProposal: boolean;
  latestMessage?: { content: string; role: "assistant" | "user" } | undefined;
  status: "answering" | "idle";
}

/**
 * Tala reacts only to UI facts. Message meaning is deliberately absent: guessing how a creator
 * feels would be unreliable, and asking a model would spend another call for decoration.
 */
export function resolveTalaState({
  active,
  hasNotice,
  hasProposal,
  latestMessage,
  status,
}: TalaStateInput): TalaState {
  if (hasNotice) return "attention";
  if (status === "answering") {
    return latestMessage?.role === "assistant" && latestMessage.content.trim().length > 0
      ? "responding"
      : "thinking";
  }
  if (hasProposal) return "success";
  return active ? "attentive" : "idle";
}

/** A tiny folded-paper star: Tala's full expression-bearing form. */
export function TalaMascot({ className, size = "standard", state }: TalaMascotProps) {
  const classes = className ? `${styles.mascot} ${className}` : styles.mascot;

  return (
    <svg
      aria-hidden="true"
      className={classes}
      data-size={size}
      data-tala-state={state}
      fill="none"
      viewBox="0 0 64 64"
    >
      <circle className={styles.glow} cx="32" cy="32" r="25" />
      <g className={styles.figure}>
        <path className={styles.leftWing} d="M18 26 6 21l5 16 8-3Z" />
        <path className={styles.rightWing} d="m46 26 12-5-5 16-8-3Z" />
        <path
          className={styles.body}
          d="M32 7c3.8 0 5.2 9.1 8.1 11.2 3 2.1 11.9-1 14 2 2.1 3-5.3 8.4-5.3 11.8s7.4 8.8 5.3 11.8c-2.1 3-11-0.1-14 2C37.2 47.9 35.8 57 32 57s-5.2-9.1-8.1-11.2c-3-2.1-11.9 1-14-2C7.8 40.8 15.2 35.4 15.2 32S7.8 23.2 9.9 20.2c2.1-3 11 0.1 14-2C26.8 16.1 28.2 7 32 7Z"
        />
        <path className={styles.paperFold} d="m16.5 32 15.5 8 15.5-8" />

        <g className={styles.eyes}>
          <ellipse className={styles.eye} cx="26" cy="29.5" rx="3.6" ry="4.1" />
          <ellipse className={styles.eye} cx="38" cy="29.5" rx="3.6" ry="4.1" />
          <circle className={styles.leftPupil} cx="26" cy="30" r="1.35" />
          <circle className={styles.rightPupil} cx="38" cy="30" r="1.35" />
        </g>

        <path className={styles.leftBrow} d="M22.8 24.2c1.7-1 3.5-1 5.1-.2" />
        <path className={styles.rightBrow} d="M36.1 24c1.6-.8 3.4-.8 5.1.2" />
        <path className={styles.smile} d="M27.5 37c2.8 3.2 6.2 3.2 9 0" />
        <path className={styles.bigSmile} d="M26.5 36.5c3.4 5 7.6 5 11 0" />
        <path className={styles.concern} d="M28 39c2.5-2.2 5.5-2.2 8 0" />
      </g>

      <g className={styles.sparkles}>
        <path d="M53 10v7m-3.5-3.5h7" />
        <path d="M10 45v5m-2.5-2.5h5" />
      </g>
    </svg>
  );
}

/** Simplified at navigation size, where facial detail would collapse into visual noise. */
export function TalaMark() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 2.8c1.5 0 2 4.1 3.2 4.9s5.2-.5 6 .7c.9 1.2-2.5 3.6-2.5 5s3.4 3.8 2.5 5c-.8 1.2-4.8-.1-6 .7S13.5 21.2 12 21.2s-2-4.1-3.2-4.9-5.2.5-6-.7c-.9-1.2 2.5-3.6 2.5-5S1.9 7.6 2.8 6.4c.8-1.2 4.8.1 6-.7S10.5 2.8 12 2.8Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M8.7 11.3h.01M15.3 11.3h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M9.5 14c1.6 1.6 3.4 1.6 5 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}
