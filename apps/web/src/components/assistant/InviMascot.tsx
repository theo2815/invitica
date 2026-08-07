import styles from "./InviMascot.module.css";

export type InviState = "attention" | "attentive" | "idle" | "responding" | "success" | "thinking";

type InviFrame = "alert" | "neutral" | "resting" | "success" | "thinking";

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

const frameByState: Record<InviState, InviFrame> = {
  attention: "alert",
  attentive: "neutral",
  idle: "resting",
  responding: "neutral",
  success: "success",
  thinking: "thinking",
};

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
 * Concept E is raster artwork by design. One lossless five-frame atlas keeps its paper texture,
 * shaded folds, irregular edges, and wax depth intact without loading the full concept sheet.
 */
export function InviMascot({ className, size = "standard", state }: InviMascotProps) {
  const classes = className ? `${styles.mascot} ${className}` : styles.mascot;

  return (
    <span
      aria-hidden="true"
      className={classes}
      data-invi-frame={frameByState[state]}
      data-invi-state={state}
      data-size={size}
    >
      <span className={styles.sprite} data-invi-sprite="concept-e" />
    </span>
  );
}

/**
 * The character cannot survive at the sidebar's 18.4 px size, so the navigation mark remains a
 * conversation bubble carrying Invi's wax seal. Its 1.7 stroke matches the neighboring icons.
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
