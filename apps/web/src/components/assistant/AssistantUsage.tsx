"use client";

import { useEffect } from "react";

import type { AssistantUsageStatus, AssistantUsage as Usage } from "./AssistantProvider";
import { useAssistant } from "./AssistantProvider";
import styles from "./AssistantUsage.module.css";

/**
 * Where "nearly out" begins.
 *
 * Five of twenty. Low enough that a creator working normally never sees the warning, and
 * early enough that one who is drafting can still change what they spend the rest on. It
 * is a count rather than a percentage because the cap is a count: "five left" is the same
 * useful sentence whether the cap is twenty or forty.
 */
const LOW_REMAINING = 5;

export type AssistantUsageLevel = "comfortable" | "low" | "spent" | "unknown";

export interface DescribedUsage {
  level: AssistantUsageLevel;
  remaining: number;
  /** Empty when the reset instant could not be read. */
  resetsAtLabel: string;
  used: number;
  dailyLimit: number;
}

/**
 * The reset instant in the reader's own clock.
 *
 * The allowance turns over at Asia/Manila midnight, which for a Philippine creator is
 * 12:00 AM and for anyone else is whatever that moment is where they are. Their own clock
 * is the honest one: it is when their messages actually come back.
 *
 * Client-side only, deliberately. Formatting this on the server would render the build
 * machine's timezone into the HTML and then disagree with the browser on hydration.
 */
function describeReset(resetsAt: string): string {
  const at = new Date(resetsAt);
  if (Number.isNaN(at.valueOf())) return "";

  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * One derivation, read by both the page meter and the composer line, so the two can never
 * put different numbers on the same screen.
 */
export function describeUsage(usage: Usage | null, status: AssistantUsageStatus): DescribedUsage {
  if (status !== "ready" || !usage) {
    return { dailyLimit: 0, level: "unknown", remaining: 0, resetsAtLabel: "", used: 0 };
  }

  const remaining = Math.max(0, usage.dailyLimit - usage.used);

  return {
    dailyLimit: usage.dailyLimit,
    level: remaining === 0 ? "spent" : remaining <= LOW_REMAINING ? "low" : "comfortable",
    remaining,
    resetsAtLabel: describeReset(usage.resetsAt),
    used: usage.used,
  };
}

/**
 * The full account of today's allowance, for `/dashboard/assistant`.
 *
 * It answers four questions in the order a creator asks them: how many have I used, how
 * many are left, out of how many, and when do they come back. The fifth — what happens
 * when they run out — is answered only at the point it becomes true, because a warning
 * about a limit fourteen messages away is noise.
 *
 * Every state is carried by words. The bar repeats what the sentence already says and is
 * hidden from assistive technology, so nothing here depends on seeing a colour or a length.
 */
export function AssistantUsageMeter() {
  const { refreshUsage, usage, usageStatus } = useAssistant();
  const described = describeUsage(usage, usageStatus);

  // The page is a creator arriving for Invi specifically, so the allowance is worth reading
  // on mount. Elsewhere the read waits until the panel is opened.
  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  if (usageStatus === "idle" || usageStatus === "loading") {
    return (
      <section aria-label="Today's messages with Invi" className={styles.meter}>
        <p className={styles.meterStatus}>Checking today&apos;s messages…</p>
      </section>
    );
  }

  if (described.level === "unknown") {
    return (
      <section
        aria-label="Today's messages with Invi"
        className={styles.meter}
        data-level="unknown"
      >
        <p className={styles.meterStatus}>
          Today&apos;s message count could not be loaded. Invi still works — you just will not see
          how many are left until this loads again.
        </p>
        <button className={styles.retry} onClick={() => void refreshUsage()} type="button">
          Try again
        </button>
      </section>
    );
  }

  const { dailyLimit, level, remaining, resetsAtLabel, used } = described;

  return (
    <section aria-label="Today's messages with Invi" className={styles.meter} data-level={level}>
      <div className={styles.meterHeading}>
        <p className={styles.meterLabel}>Today&apos;s messages</p>
        <p className={styles.meterCount}>
          <strong>{remaining}</strong> of {dailyLimit} left
        </p>
      </div>

      {/* Decoration for a number the line above already states exactly. */}
      <div aria-hidden="true" className={styles.track}>
        <span className={styles.fill} style={{ width: `${(used / dailyLimit) * 100}%` }} />
      </div>

      <p className={styles.meterDetail}>
        {level === "spent"
          ? `You have used all ${dailyLimit} of today's messages. Invi cannot answer, draft, or read a guest list again until they reset${resetsAtLabel ? ` at ${resetsAtLabel}` : ""}. Nothing you have already saved is affected.`
          : level === "low"
            ? `${used} used so far${resetsAtLabel ? `. They reset at ${resetsAtLabel}` : ""}. Drafting an invitation costs the same one message as a question.`
            : `${used} used so far${resetsAtLabel ? `, and they reset at ${resetsAtLabel}` : ""}. Questions, drafts, and guest lists all come out of this one allowance.`}
      </p>
    </section>
  );
}

/**
 * The same allowance in one line, for the composer's action row.
 *
 * It shares the row the character counter already occupies rather than adding chrome to a
 * panel whose scarcest resource is height. The counter wins the slot when it appears,
 * because a message about to be truncated is more urgent than a count of the day's
 * remaining ones.
 *
 * Silent when the count is unknown. A creator who cannot be told how many are left is
 * better served by an uncluttered composer than by an apology they cannot act on — the
 * full meter on `/dashboard/assistant` is where that failure is reported and retried.
 */
export function AssistantUsageLine() {
  const { usage, usageStatus } = useAssistant();
  const { dailyLimit, level, remaining } = describeUsage(usage, usageStatus);

  if (level === "unknown") return null;

  return (
    <span className={styles.line} data-level={level}>
      {level === "spent" ? `No messages left today` : `${remaining} of ${dailyLimit} left today`}
    </span>
  );
}
