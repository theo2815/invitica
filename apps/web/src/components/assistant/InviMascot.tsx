import styles from "./InviMascot.module.css";

export type InviState = "attention" | "attentive" | "idle" | "responding" | "success" | "thinking";

interface InviMascotProps {
  className?: string | undefined;
  size?: "compact" | "standard" | undefined;
  state: InviState;
}

interface InviStateInput {
  active: boolean;
  hasNotice: boolean;
  hasProposal: boolean;
  latestMessage?: { content: string; role: "assistant" | "user" } | undefined;
  status: "answering" | "idle";
}

/**
 * Invi reacts only to UI facts. Message meaning is deliberately absent: guessing how a creator
 * feels would be unreliable, and asking a model would spend another call for decoration.
 */
export function resolveInviState({
  active,
  hasNotice,
  hasProposal,
  latestMessage,
  status,
}: InviStateInput): InviState {
  if (hasNotice) return "attention";
  if (status === "answering") {
    return latestMessage?.role === "assistant" && latestMessage.content.trim().length > 0
      ? "responding"
      : "thinking";
  }
  if (hasProposal) return "success";
  return active ? "attentive" : "idle";
}

/**
 * The sealed-letter keeper: a note rising out of a shallow envelope pocket, sealed in wax.
 *
 * The face lives on the note rather than on the envelope, so one transform settles the whole
 * expression back into the pocket when nothing is being asked. Idle is that tucked-in, eyes-closed
 * state and it is completely static — it is what a creator sees in the corner of every dashboard
 * page for most of a session, and a figure that fidgets there is asking for attention it has no
 * reason to want.
 *
 * Square 64x64 because every caller sizes it square, from 2rem in a task dialog to 4.5rem on the
 * Assistant page.
 */
export function InviMascot({ className, size = "standard", state }: InviMascotProps) {
  const classes = className ? `${styles.mascot} ${className}` : styles.mascot;

  return (
    <svg
      aria-hidden="true"
      className={classes}
      data-invi-state={state}
      data-size={size}
      fill="none"
      viewBox="0 0 64 64"
    >
      <circle className={styles.glow} cx="32" cy="34" r="26" />

      <g className={styles.figure}>
        {/* The note, and everything written on it. Drawn first so the pocket in front of it hides
            the paper below the fold line without a clip path. Nearly as wide as the envelope on
            purpose: a narrow note stops reading as paper inside a pocket and starts reading as a
            head on a box. */}
        <g className={styles.letter}>
          <path className={styles.paper} d="M15 39V10.6q4.25-1.8 8.5 0t8.5 0t8.5 0V39Z" />
          <path className={styles.letterFold} d="M18.6 31h26.8" />

          <g className={styles.eyes}>
            <ellipse className={styles.eye} cx="27.2" cy="20.2" rx="2.5" ry="2.9" />
            <ellipse className={styles.eye} cx="36.8" cy="20.2" rx="2.5" ry="2.9" />
            <circle className={styles.leftPupil} cx="27.2" cy="20.5" r="1.15" />
            <circle className={styles.rightPupil} cx="36.8" cy="20.5" r="1.15" />
          </g>
          {/* Two closed-eye forms, because they mean different things: resting curves down,
              pleased curves up. */}
          <path className={styles.restEyes} d="M24.7 19.4q2.5 2.1 5 0M34.3 19.4q2.5 2.1 5 0" />
          <path className={styles.happyEyes} d="M24.7 21.4q2.5-2.4 5 0M34.3 21.4q2.5-2.4 5 0" />

          {/* Brows are hidden until something needs looking at. A resting face with brows reads
              as an opinion about nothing. */}
          <path className={styles.leftBrow} d="M24.7 15.4c1.5-.9 3.1-.9 4.6-.2" />
          <path className={styles.rightBrow} d="M34.7 15.2c1.5-.7 3.1-.7 4.6.2" />

          <path className={styles.mouth} d="M30 26.8h4" />
          <path className={styles.smile} d="M29.4 26q2.6 2.6 5.2 0" />
          <path className={styles.concern} d="M29.4 28q2.6-2.2 5.2 0" />
        </g>

        {/* Side folds, not wings. They stay paper: straight edges and no feathering, and short
            enough to read as the envelope's own flaps rather than as arms hanging off it. */}
        <path className={styles.leftFold} d="M12.4 37.5 5 43l7.4 5.5Z" />
        <path className={styles.rightFold} d="m51.6 37.5 7.4 5.5-7.4 5.5Z" />

        <rect className={styles.pocket} height="23" rx="2.6" width="40" x="12" y="34" />
        {/* Only the closing flap is drawn. The bottom seam is there in a real envelope and adds
            nothing here but a second line crossing the seal. */}
        <path className={styles.pocketFolds} d="M12.4 34.4 32 46l19.6-11.6" />

        <circle className={styles.seal} cx="32" cy="46" r="5.2" />
        <path className={styles.sealMark} d="M29.6 46.7q2.4-2 4.8 0" />
      </g>

      {/* The one moment worth marking: a proposal that survived validation. */}
      <g className={styles.marks}>
        <path d="M24 6 21.8 1.8M32 4.6V0.8M40 6 42.2 1.8" />
      </g>
    </svg>
  );
}

/**
 * Invi at navigation size, where the character cannot survive.
 *
 * The sidebar renders this at 1.15rem — 18.4 px. A face is three pixels of detail there, and it
 * would make this the only navigation icon with one, beside a house, an envelope, four panes, and
 * two figures. So the mark names what the destination holds the way each of its four peers does: a
 * conversation. The wax seal is what separates that conversation from one with a person, and it is
 * Invi's own — the same disc the mascot carries at the foot of its envelope.
 *
 * Stroked at 1.7 to match `Home`, `Envelope`, `Grid`, and `Users` exactly. The seal is filled
 * rather than stroked, and carries no impressed line: at 18.4 px the disc is under 2.5 px across
 * and any mark inside it closes up. The impression stays on the full character, which has room.
 */
export function InviMark() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M5.5 4h13A2.5 2.5 0 0 1 21 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-7.2L7 19.6V16H5.5A2.5 2.5 0 0 1 3 13.5v-7A2.5 2.5 0 0 1 5.5 4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="10" fill="currentColor" r="3.15" />
    </svg>
  );
}
