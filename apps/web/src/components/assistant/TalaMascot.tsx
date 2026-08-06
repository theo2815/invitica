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

/**
 * Tala at navigation size, where the character cannot survive.
 *
 * The sidebar renders this at 1.15rem — 18.4 px. Tala's own face is three pixels of detail
 * there, and it made this the only navigation icon with one, beside a house, an envelope,
 * four panes, and two figures. So the mark stops being a small Tala and starts naming what
 * the destination holds, the way each of its four peers does: a conversation. The spark is
 * what separates that conversation from one with a person, and it is Tala's own — the same
 * form the mascot carries beside its wings.
 *
 * Stroked at 1.7 to match `Home`, `Envelope`, `Grid`, and `Users` exactly. The sparks are
 * filled rather than stroked because a stroked four-point star closes up at this size.
 */
export function TalaMark() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M5.5 4h13A2.5 2.5 0 0 1 21 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-7.2L7 19.6V16H5.5A2.5 2.5 0 0 1 3 13.5v-7A2.5 2.5 0 0 1 5.5 4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M11.2 6.4C11.2 9.45 11.75 10 14.8 10c-3.05 0-3.6.55-3.6 3.6 0-3.05-.55-3.6-3.6-3.6 3.05 0 3.6-.55 3.6-3.6Z"
        fill="currentColor"
      />
      <path
        d="M17.6 5.2c0 1.42.28 1.7 1.7 1.7-1.42 0-1.7.28-1.7 1.7 0-1.42-.28-1.7-1.7-1.7 1.42 0 1.7-.28 1.7-1.7Z"
        fill="currentColor"
      />
    </svg>
  );
}
