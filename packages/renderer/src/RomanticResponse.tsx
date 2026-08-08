"use client";

import { type MouseEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";

export type RomanticDeclineButtonBehavior = "static" | "dodge-five";

export const ROMANTIC_DECLINE_DODGE_LIMIT = 5;

/**
 * One line per dodge, in the asker's voice rather than the product's. The last line stops pleading
 * and asks for the reason, because the next click opens the required decline message.
 */
const ROMANTIC_DECLINE_PLEAS = [
  "Please?",
  "Are you sure?",
  "Not even a little yes?",
  "I can wait.",
  "Okay. Tell me why?",
] as const;

interface RomanticResponseChoicesProps {
  declineButtonBehavior: RomanticDeclineButtonBehavior;
  disabled?: boolean;
  dodgeCount: number;
  onDodge: () => void;
  onNo: () => void;
  onYes: () => void;
  reducedMotion?: boolean;
}

function useReducedMotion(explicitPreference: boolean): boolean {
  const [systemPreference, setSystemPreference] = useState(false);

  useEffect(() => {
    if (explicitPreference || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setSystemPreference(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, [explicitPreference]);

  return explicitPreference || systemPreference;
}

function RomanticYesMark() {
  return (
    <svg aria-hidden="true" className="rq-choice-mark" focusable="false" viewBox="0 0 24 24">
      <path d="M12 20C9.2 17.6 4 14.2 4 9.5 4 5.2 9.1 4 12 7.6 14.9 4 20 5.2 20 9.5c0 4.7-5.2 8.1-8 10.5Z" />
    </svg>
  );
}

/**
 * The answer wears the answer. A heart-and-check told the guest which button they pressed, which
 * they already knew; a face tells them how it landed. Both are drawn in the same stroke weight as
 * the rest of the correspondence set, and the two fills use presentation attributes so the mark
 * survives the `fill: none` its three mount points each declare on the svg element.
 */
export function RomanticReplyMark({ answer }: { answer: "no" | "yes" }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32">
      <circle cx="14.5" cy="17.5" r="10" />
      {answer === "yes" ? (
        <>
          <path d="M9.4 15.6c.6-1.2 2.2-1.2 2.8 0M16.9 15.6c.6-1.2 2.2-1.2 2.8 0" />
          <path d="M9.9 20.2c1 1.9 2.6 2.9 4.6 2.9s3.6-1 4.6-2.9" />
          <path
            d="M25 10.6c-2-1.8-3.4-2.9-3.4-4.3 0-1.1.9-1.7 1.7-1.7.6 0 1.3.4 1.7 1 .4-.6 1.1-1 1.7-1 .8 0 1.7.6 1.7 1.7 0 1.4-1.4 2.5-3.4 4.3Z"
            fill="currentcolor"
            stroke="none"
          />
        </>
      ) : (
        <>
          <path d="M9.4 15.4c.6 1.3 2.2 1.3 2.8 0M16.9 15.4c.6 1.3 2.2 1.3 2.8 0" />
          <path d="M9.9 23c1-1.9 2.6-2.9 4.6-2.9s3.6 1 4.6 2.9" />
          <path
            d="M8.6 19.1c.77 1.2 1.15 1.8 1.15 2.15a1.15 1.15 0 0 1-2.3 0c0-.35.38-.95 1.15-2.15Z"
            fill="currentcolor"
            stroke="none"
          />
        </>
      )}
    </svg>
  );
}

function RomanticPleaFace() {
  return (
    <svg aria-hidden="true" className="rq-plea-face" focusable="false" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="8" />
      <path d="M7 9.2c.5.9 1.5.9 2 0M11 9.2c.5.9 1.5.9 2 0" />
      <path d="M7 14.2c.6-1.2 1.7-1.9 3-1.9s2.4.7 3 1.9" />
    </svg>
  );
}

export function RomanticResponseChoices({
  declineButtonBehavior,
  disabled = false,
  dodgeCount,
  onDodge,
  onNo,
  onYes,
  reducedMotion = false,
}: RomanticResponseChoicesProps) {
  const shouldReduceMotion = useReducedMotion(reducedMotion);
  const dodgeEnabled = declineButtonBehavior === "dodge-five" && !shouldReduceMotion;
  const boundedDodgeCount = Math.min(Math.max(0, dodgeCount), ROMANTIC_DECLINE_DODGE_LIMIT);

  function chooseNo(event: MouseEvent<HTMLButtonElement>) {
    // Keyboard and assistive-technology clicks have detail 0. They select No immediately instead
    // of being forced through a pointer joke they cannot perceive or reliably follow.
    const pointerActivation = event.detail > 0;
    if (dodgeEnabled && pointerActivation && boundedDodgeCount < ROMANTIC_DECLINE_DODGE_LIMIT) {
      onDodge();
      return;
    }
    onNo();
  }

  return (
    <div
      className="rq-choices"
      data-dodge-enabled={dodgeEnabled}
      data-dodge-step={boundedDodgeCount}
    >
      <style>{romanticResponseStyles}</style>
      {dodgeEnabled ? (
        // Decorative on purpose. Keyboard and assistive-technology activation never dodges, so this
        // never carries information those guests would otherwise lose, and five polite live-region
        // announcements during a joke would be worse than silence. The plea for step 0 is rendered
        // under opacity 0 so the reserved height is exact and nothing shifts on the first dodge.
        <p aria-hidden="true" className="rq-plea" data-shown={boundedDodgeCount > 0}>
          <RomanticPleaFace />
          <span>{ROMANTIC_DECLINE_PLEAS[Math.max(0, boundedDodgeCount - 1)]}</span>
        </p>
      ) : null}
      <div className="rq-choice-field">
        <button
          className="rq-choice rq-choice--yes"
          disabled={disabled}
          onClick={onYes}
          type="button"
        >
          <RomanticYesMark />
          <span>Yes</span>
        </button>
        <button
          className="rq-choice rq-choice--no"
          disabled={disabled}
          onClick={chooseNo}
          type="button"
        >
          No
        </button>
      </div>
    </div>
  );
}

export function RomanticResponsePreview({
  declineButtonBehavior,
  reducedMotion = false,
}: {
  declineButtonBehavior: RomanticDeclineButtonBehavior;
  reducedMotion?: boolean;
}) {
  const [dodgeCount, setDodgeCount] = useState(0);
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState<
    "choice" | "message-no" | "message-yes" | "sent-yes" | "sent-no"
  >("choice");
  const messageId = useId();
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (stage === "message-no" || stage === "message-yes") messageRef.current?.focus();
  }, [stage]);

  function resetPreview() {
    setDodgeCount(0);
    setMessage("");
    setStage("choice");
  }

  let content: ReactNode;

  if (stage === "sent-yes" || stage === "sent-no") {
    const answer = stage === "sent-yes" ? "yes" : "no";
    content = (
      <div className="rq-preview-result" role="status">
        <span className="rq-result-mark">
          <RomanticReplyMark answer={answer} />
        </span>
        <span className="rq-result-kicker">Preview response</span>
        <strong>{answer === "yes" ? "Yes it is." : "A no, then."}</strong>
        <p>
          {answer === "yes" && message.trim()
            ? "In a real invitation, this yes and your note would send now."
            : answer === "yes"
              ? "In a real invitation, this yes would send now."
              : "In a real invitation, this answer and your message would send now."}
        </p>
        <button className="rq-result-reset" onClick={resetPreview} type="button">
          Try again
        </button>
      </div>
    );
  } else if (stage === "message-yes" || stage === "message-no") {
    const answer = stage === "message-yes" ? "yes" : "no";
    const messageRequired = answer === "no";
    content = (
      <form
        className="rq-message-form"
        data-answer={answer}
        onSubmit={(event) => {
          event.preventDefault();
          if (!messageRequired || message.trim())
            setStage(answer === "yes" ? "sent-yes" : "sent-no");
        }}
      >
        <fieldset className="rq-message-form__body">
          <div className="rq-form-heading">
            <span className="rq-form-mark">
              <RomanticReplyMark answer={answer} />
            </span>
            <span className="rq-form-heading-copy">
              <span className="rq-form-kicker">Your reply</span>
              <label className="rq-form-title" htmlFor={messageId}>
                {messageRequired ? "Please leave a message." : "Add a note, if you would like."}
              </label>
            </span>
            <span className="rq-form-requirement">{messageRequired ? "Required" : "Optional"}</span>
          </div>
          <div className="rq-message-field">
            <textarea
              id={messageId}
              maxLength={500}
              onChange={(event) => setMessage(event.currentTarget.value)}
              placeholder={
                messageRequired
                  ? "Share what you would like them to know."
                  : "Write a little note to go with your yes."
              }
              ref={messageRef}
              required={messageRequired}
              rows={4}
              value={message}
            />
            <div className="rq-message-meta">
              <small>
                {messageRequired
                  ? "A thoughtful message is needed to send No."
                  : "A note is completely optional."}
              </small>
              <output aria-label={`${message.length} of 500 characters`}>
                {message.length}/500
              </output>
            </div>
          </div>
          <div className="rq-form-actions">
            <button className="rq-form-back" onClick={() => setStage("choice")} type="button">
              Back
            </button>
            <button className="rq-form-submit" type="submit">
              Send {answer}
            </button>
          </div>
        </fieldset>
      </form>
    );
  } else {
    content = (
      <RomanticResponseChoices
        declineButtonBehavior={declineButtonBehavior}
        dodgeCount={dodgeCount}
        onDodge={() => setDodgeCount((current) => current + 1)}
        onNo={() => {
          setMessage("");
          setStage("message-no");
        }}
        onYes={() => {
          setMessage("");
          setStage("message-yes");
        }}
        reducedMotion={reducedMotion}
      />
    );
  }

  return (
    <>
      <style>{romanticResponseStyles}</style>
      {content}
    </>
  );
}

export const romanticResponseStyles = `
.rq-choices,
.rq-choices * { box-sizing: border-box; }
.rq-choices {
  display: grid;
  width: 100%;
  gap: 0.5rem;
}
/* The dodge geometry lives one level down so the plea can hold a row above it without the five
   absolute positions below having to work around a band that is only sometimes occupied. */
.rq-choice-field {
  position: relative;
  width: 100%;
  /* Tall enough that the two bottom-row dodges clear the vertically centered Yes by more than a
     hairline on a 320 px card. At 9.75rem they cleared it by 6 px and read as one stacked block. */
  min-height: 10.5rem;
}
.rq-plea {
  position: relative;
  display: flex;
  align-items: center;
  justify-self: center;
  max-width: 100%;
  gap: 0.42rem;
  margin: 0;
  padding: 0.46rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon, currentcolor) 30%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ie-paper, white) 90%, white);
  box-shadow: 0.16rem 0.2rem 0 color-mix(in srgb, var(--ie-ribbon, currentcolor) 11%, transparent);
  color: color-mix(in srgb, currentcolor 84%, transparent);
  font-size: 0.82rem;
  font-weight: 560;
  line-height: 1.25;
  opacity: 0;
  transform: translateY(0.3rem) scale(0.94);
  transition: opacity 170ms ease, transform 170ms cubic-bezier(0.2, 1.28, 0.5, 1);
}
.rq-plea[data-shown="true"] { opacity: 1; transform: none; }
.rq-plea::after {
  position: absolute;
  bottom: -0.3rem;
  left: 50%;
  width: 0.56rem;
  height: 0.56rem;
  border-right: 1px solid color-mix(in srgb, var(--ie-ribbon, currentcolor) 30%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--ie-ribbon, currentcolor) 30%, transparent);
  background: inherit;
  content: "";
  transform: translateX(-50%) rotate(45deg);
}
/* The tail points at wherever No ran to, so the bubble reads as the button speaking. */
.rq-choices[data-dodge-step="2"] .rq-plea::after,
.rq-choices[data-dodge-step="3"] .rq-plea::after,
.rq-choices[data-dodge-step="5"] .rq-plea::after {
  right: 1.05rem;
  left: auto;
  transform: rotate(45deg);
}
.rq-choices[data-dodge-step="4"] .rq-plea::after {
  left: 1.05rem;
  transform: rotate(45deg);
}
.rq-plea-face {
  width: 1.05rem;
  height: 1.05rem;
  flex: 0 0 auto;
  fill: none;
  stroke: var(--ie-ribbon, currentcolor);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
.rq-choice,
.rq-preview-result button,
.rq-message-form button {
  min-width: 7.25rem;
  min-height: 2.75rem;
  padding: 0.7rem 1.15rem;
  border: 1px solid currentcolor;
  border-radius: 0.4rem;
  font: inherit;
  font-weight: 720;
  cursor: pointer;
}
.rq-choice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  letter-spacing: 0.015em;
}
.rq-choice-field .rq-choice {
  width: min(7.5rem, calc(50% - 0.85rem));
  min-width: 0;
}
.rq-choice-mark {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentcolor;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
.rq-choice:focus-visible,
.rq-preview-result button:focus-visible,
.rq-message-form :is(textarea, button):focus-visible {
  outline: 3px solid var(--ie-ribbon, currentcolor);
  outline-offset: 3px;
}
.rq-choice--yes {
  position: absolute;
  top: 50%;
  left: 0.65rem;
  background: var(--ie-ribbon, currentcolor);
  color: var(--ot-accent-contrast, var(--invitation-accent-contrast, white));
  box-shadow: 0.24rem 0.3rem 0 color-mix(in srgb, var(--ie-ribbon, currentcolor) 24%, transparent);
  transform: translateY(-50%) rotate(-1deg);
}
.rq-choice--no {
  position: absolute;
  top: 50%;
  right: 0.65rem;
  background: color-mix(in srgb, var(--ie-paper, white) 92%, transparent);
  color: inherit;
  box-shadow: 0.2rem 0.24rem 0 color-mix(in srgb, currentcolor 8%, transparent);
  transform: translateY(-50%) rotate(1deg);
  transition: top 180ms ease, right 180ms ease, bottom 180ms ease, left 180ms ease, transform 180ms ease;
}
.rq-choices[data-dodge-enabled="false"] .rq-choice-field {
  display: grid;
  min-height: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}
.rq-choices[data-dodge-enabled="false"] .rq-choice {
  position: static;
  width: 100%;
  transform: none;
}
.rq-choices[data-dodge-enabled="true"][data-dodge-step="1"] .rq-choice--no {
  top: 0.35rem;
  right: auto;
  left: 50%;
  transform: translateX(-50%);
}
.rq-choices[data-dodge-enabled="true"][data-dodge-step="2"] .rq-choice--no {
  top: 0.35rem;
  right: 0.35rem;
  transform: none;
}
.rq-choices[data-dodge-enabled="true"][data-dodge-step="3"] .rq-choice--no {
  top: auto;
  right: 0.35rem;
  bottom: 0.35rem;
  transform: none;
}
.rq-choices[data-dodge-enabled="true"][data-dodge-step="4"] .rq-choice--no {
  top: auto;
  right: auto;
  bottom: 0.35rem;
  left: 0.35rem;
  transform: none;
}
/* The fifth move walks back to where it started rather than stopping in the middle of the field.
   Dead center overlapped Yes on any card narrower than about 24rem, because Yes is pinned to the
   left edge at the same vertical center and both controls are up to 7.5rem wide. */
.rq-choices[data-dodge-enabled="true"][data-dodge-step="5"] .rq-choice--no {
  top: 50%;
  right: 0.65rem;
  bottom: auto;
  left: auto;
  transform: translateY(-50%) rotate(1deg);
}
.rq-preview-result,
.rq-preview-result *,
.rq-message-form,
.rq-message-form * { box-sizing: border-box; }
.rq-preview-result {
  display: grid;
  justify-items: center;
  width: 100%;
  gap: 0.48rem;
  padding: clamp(1.35rem, 7cqi, 2.1rem);
  border: 1px solid color-mix(in srgb, var(--ie-ribbon, currentcolor) 24%, transparent);
  border-radius: 1rem;
  background:
    linear-gradient(145deg, color-mix(in srgb, white 80%, transparent), color-mix(in srgb, var(--ie-paper, white) 86%, transparent));
  box-shadow: 0.32rem 0.38rem 0 color-mix(in srgb, var(--ie-ribbon, currentcolor) 10%, transparent);
  text-align: center;
}
.rq-result-mark,
.rq-form-mark {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon, currentcolor) 34%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--ie-ribbon, currentcolor) 7%, white);
  color: var(--ie-ribbon, currentcolor);
}
.rq-result-mark { width: 3.35rem; height: 3.35rem; margin-bottom: 0.2rem; }
.rq-result-mark svg { width: 1.85rem; height: 1.85rem; }
.rq-result-mark svg,
.rq-form-mark svg {
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.45;
}
.rq-result-kicker,
.rq-form-kicker {
  color: var(--ie-ribbon, currentcolor);
  font-size: 0.66rem;
  font-weight: 780;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.rq-preview-result strong {
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.35rem, 7cqi, 1.75rem);
  font-weight: 520;
  line-height: 1.15;
}
.rq-preview-result p {
  max-width: 30rem;
  margin: 0.15rem 0 0.8rem;
  color: color-mix(in srgb, currentcolor 74%, transparent);
  font-size: 0.84rem;
  line-height: 1.55;
}
.rq-result-reset,
.rq-form-back { background: color-mix(in srgb, var(--ie-paper, white) 92%, transparent); color: inherit; }
.rq-message-form { width: 100%; text-align: left; }
.rq-message-form__body {
  display: grid;
  min-width: 0;
  gap: 1rem;
  margin: 0;
  padding: 0;
  border: 0;
}
.rq-form-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
}
.rq-form-mark { width: 2.8rem; height: 2.8rem; }
.rq-form-mark svg { width: 1.55rem; height: 1.55rem; }
.rq-form-heading-copy { display: grid; min-width: 0; gap: 0.12rem; }
.rq-form-title {
  color: inherit;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(1.05rem, 5.5cqi, 1.35rem);
  font-weight: 540;
  line-height: 1.2;
}
.rq-form-requirement {
  padding: 0.33rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon, currentcolor) 28%, transparent);
  border-radius: 999px;
  color: var(--ie-ribbon, currentcolor);
  font-size: 0.64rem;
  font-weight: 760;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.rq-message-field {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon, currentcolor) 24%, transparent);
  border-radius: 0.85rem;
  background: color-mix(in srgb, white 76%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 88%, transparent);
}
.rq-message-form textarea {
  width: 100%;
  min-height: 7rem;
  padding: 0.9rem 1rem 0.7rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.55;
  resize: vertical;
}
.rq-message-form textarea::placeholder { color: color-mix(in srgb, currentcolor 48%, transparent); }
.rq-message-form textarea:focus-visible { outline-offset: -4px; }
.rq-message-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.62rem 1rem 0.72rem;
  border-top: 1px dashed color-mix(in srgb, var(--ie-ribbon, currentcolor) 22%, transparent);
  color: color-mix(in srgb, currentcolor 66%, transparent);
}
.rq-message-meta small,
.rq-message-meta output { font-size: 0.7rem; font-weight: 520; line-height: 1.35; }
.rq-message-meta output { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.rq-form-actions { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.65rem; }
.rq-form-submit { background: var(--ie-ribbon, currentcolor); color: var(--ot-accent-contrast, var(--invitation-accent-contrast, white)); }
@container (max-width: 20rem) {
  .rq-choice { min-width: 5.5rem; }
  .rq-plea { padding-inline: 0.62rem; font-size: 0.76rem; }
  .rq-form-heading { grid-template-columns: auto minmax(0, 1fr); }
  .rq-form-requirement { grid-column: 2; justify-self: start; }
  .rq-message-meta { align-items: flex-start; }
  .rq-form-actions { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .rq-choice--no,
  .rq-plea { transition: none; }
  .rq-plea { transform: none; }
}
`;
