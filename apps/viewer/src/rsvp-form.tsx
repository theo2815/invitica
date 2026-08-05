"use client";

import {
  type GuestRsvpAttendance,
  type GuestRsvpContext,
  type GuestRsvpMutationRequest,
  type GuestRsvpResponse,
  guestRsvpMutationRequestSchema,
  guestRsvpMutationResponseSchema,
} from "@invitica/invitation-schema";
import {
  type RomanticDeclineButtonBehavior,
  RomanticReplyMark,
  RomanticResponseChoices,
  romanticResponseStyles,
} from "@invitica/renderer";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { fetchWithTimeout } from "./fetch-with-timeout";

const RSVP_MUTATION_TIMEOUT_MS = 15_000;
const RSVP_LONG_WAIT_MS = 8_000;

type SubmissionStage = "checking" | "idle" | "saving";
type RefreshReason = "closed" | "conflict";

interface RsvpFormProps {
  context: GuestRsvpContext;
  declineButtonBehavior?: RomanticDeclineButtonBehavior;
  locale: "en-PH" | "fil-PH";
  onRefresh: () => Promise<boolean>;
  onSaved: (response: GuestRsvpResponse) => void;
  publicIdentifier: string;
  question?: string;
  responseMode?: "attendance" | "romantic-question";
  timezone: string;
  token: string;
}

function deadlineLabel(deadline: string | null, locale: RsvpFormProps["locale"], timezone: string) {
  if (!deadline) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: timezone,
    }).format(new Date(deadline));
  } catch {
    return null;
  }
}

export function RsvpForm({
  context,
  declineButtonBehavior = "static",
  locale,
  onRefresh,
  onSaved,
  publicIdentifier,
  question,
  responseMode = "attendance",
  timezone,
  token,
}: RsvpFormProps) {
  const [attendance, setAttendance] = useState<GuestRsvpAttendance>(
    context.response?.attendance ?? "attending",
  );
  const [attendeeCount, setAttendeeCount] = useState(
    context.response?.attendance === "attending" ? context.response.attendeeCount : 1,
  );
  const [message, setMessage] = useState(context.response?.message ?? "");
  const [romanticMessageAnswer, setRomanticMessageAnswer] = useState<GuestRsvpAttendance | null>(
    null,
  );
  const [declineDodgeCount, setDeclineDodgeCount] = useState(0);
  const [editing, setEditing] = useState(context.response === null);
  const [error, setError] = useState<string>();
  const [longWait, setLongWait] = useState(false);
  const [refreshReason, setRefreshReason] = useState<RefreshReason>();
  const [submissionStage, setSubmissionStage] = useState<SubmissionStage>("idle");
  const operationInFlight = useRef(false);
  const romanticMessageId = useId();
  const romanticMessageRef = useRef<HTMLTextAreaElement>(null);
  const retryRequest = useRef<GuestRsvpMutationRequest | undefined>(undefined);

  useEffect(() => {
    if (romanticMessageAnswer) romanticMessageRef.current?.focus();
  }, [romanticMessageAnswer]);

  useEffect(() => {
    const response = context.response;
    setAttendance(response?.attendance ?? "attending");
    setAttendeeCount(response?.attendance === "attending" ? response.attendeeCount : 1);
    setMessage(response?.message ?? "");
    setRomanticMessageAnswer(null);
    setDeclineDodgeCount(0);
    setEditing(response === null);
    setError(undefined);
    setRefreshReason(undefined);
    retryRequest.current = undefined;
  }, [context.response, context.status]);

  function changeDraft(action: () => void) {
    action();
    retryRequest.current = undefined;
    if (!refreshReason) setError(undefined);
  }

  async function refreshLatest(reason: RefreshReason) {
    setLongWait(false);
    setSubmissionStage("checking");

    let refreshed = false;
    try {
      refreshed = await onRefresh();
    } catch {
      refreshed = false;
    }

    if (refreshed) {
      setError(undefined);
      setRefreshReason(undefined);
      return;
    }

    setRefreshReason(reason);
    setError(
      reason === "closed"
        ? "We could not confirm whether responses have closed. Check your connection and try again."
        : "Your response changed elsewhere, but the latest response could not be loaded. Check your connection and try again.",
    );
  }

  async function retryRefresh() {
    if (operationInFlight.current || !refreshReason) return;

    operationInFlight.current = true;
    setError(undefined);
    try {
      await refreshLatest(refreshReason);
    } finally {
      operationInFlight.current = false;
      setSubmissionStage("idle");
    }
  }

  async function saveResponse(
    override?: Readonly<{
      attendance: GuestRsvpAttendance;
      attendeeCount: number;
      message: string;
    }>,
  ) {
    if (operationInFlight.current) return;
    setError(undefined);

    const nextAttendance = override?.attendance ?? attendance;
    const nextAttendeeCount = override?.attendeeCount ?? attendeeCount;
    const nextMessage = override?.message ?? message;

    let request = retryRequest.current;
    if (!request) {
      const parsed = guestRsvpMutationRequestSchema.safeParse({
        attendance: nextAttendance,
        attendeeCount: nextAttendance === "attending" ? nextAttendeeCount : 0,
        expectedRevision: context.response?.revision ?? 0,
        message: nextMessage,
        mutationId: crypto.randomUUID(),
        publicIdentifier,
        token,
      });

      if (!parsed.success) {
        setError(
          nextAttendance === "attending"
            ? `Choose a party size from 1 to ${context.capacity}.`
            : "Review your response and try again.",
        );
        return;
      }
      request = parsed.data;
    }

    if (request.attendance === "attending" && request.attendeeCount > context.capacity) {
      retryRequest.current = undefined;
      setError(`Choose a party size from 1 to ${context.capacity}.`);
      return;
    }

    retryRequest.current = request;
    operationInFlight.current = true;
    setLongWait(false);
    setRefreshReason(undefined);
    setSubmissionStage("saving");
    const longWaitTimer = window.setTimeout(() => setLongWait(true), RSVP_LONG_WAIT_MS);

    try {
      const response = await fetchWithTimeout(
        "/api/public/rsvp",
        {
          body: JSON.stringify(request),
          headers: { "content-type": "application/json" },
          method: "POST",
          referrerPolicy: "no-referrer",
        },
        RSVP_MUTATION_TIMEOUT_MS,
      );
      if (response.ok) {
        const parsed = guestRsvpMutationResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("Invalid RSVP response");
        retryRequest.current = undefined;
        setError(undefined);
        onSaved(parsed.data.response);
        setEditing(false);
        return;
      }

      const result = (await response.json().catch(() => null)) as { status?: unknown } | null;
      if (response.status === 409 || result?.status === "conflict") {
        retryRequest.current = undefined;
        window.clearTimeout(longWaitTimer);
        await refreshLatest("conflict");
      } else if (response.status === 410 || result?.status === "closed") {
        retryRequest.current = undefined;
        window.clearTimeout(longWaitTimer);
        await refreshLatest("closed");
      } else if (response.status === 400 || result?.status === "invalid") {
        retryRequest.current = undefined;
        setError("Review your response and try again.");
      } else if (response.status === 404) {
        retryRequest.current = undefined;
        setError("This personalized response link is no longer available.");
      } else {
        setError(
          "We could not confirm that your response was saved. Your answers are still here; try again safely.",
        );
      }
    } catch {
      setError(
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "You appear to be offline. Your answers are still here; reconnect and try again safely."
          : "We could not confirm that your response was saved. Your answers are still here; check your connection and try again safely.",
      );
    } finally {
      window.clearTimeout(longWaitTimer);
      operationInFlight.current = false;
      setLongWait(false);
      setSubmissionStage("idle");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveResponse();
  }

  function chooseRomanticYes() {
    changeDraft(() => {
      setAttendance("attending");
      setAttendeeCount(1);
      if (context.response?.attendance !== "attending") setMessage("");
      setRomanticMessageAnswer("attending");
    });
  }

  function chooseRomanticNo() {
    changeDraft(() => {
      setAttendance("declined");
      if (context.response?.attendance !== "declined") setMessage("");
      setRomanticMessageAnswer("declined");
    });
  }

  async function submitRomanticAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!romanticMessageAnswer) return;
    if (romanticMessageAnswer === "declined" && !message.trim()) {
      setError("Enter a message before sending your answer.");
      return;
    }
    await saveResponse({
      attendance: romanticMessageAnswer,
      attendeeCount: romanticMessageAnswer === "attending" ? 1 : 0,
      message,
    });
  }

  const deadline = deadlineLabel(context.deadline, locale, timezone);
  const submitting = submissionStage !== "idle";
  const retryingSave = Boolean(error && retryRequest.current && !refreshReason);
  const submissionStatus =
    submissionStage === "checking"
      ? "Checking the latest response..."
      : submissionStage === "saving" && longWait
        ? "This is taking longer than usual. Keep this page open while we finish saving."
        : submissionStage === "saving"
          ? "Saving your response..."
          : retryingSave
            ? "Trying again will safely reuse the same submission."
            : "";

  if (context.status === "unavailable") {
    return (
      <p className="rsvp-card__notice">Online response is not available for this invitation.</p>
    );
  }

  if (context.status === "closed" && context.response === null) {
    return (
      <div className="rsvp-card rsvp-card--centered">
        <p className="rsvp-card__eyebrow">Responses closed</p>
        <p>
          {deadline ? `The reply window closed on ${deadline}.` : "The reply window has closed."}
        </p>
      </div>
    );
  }

  if (!editing && context.response) {
    const attending = context.response.attendance === "attending";
    const romanticQuestion = responseMode === "romantic-question";
    return (
      <div
        className={`rsvp-card rsvp-card--centered${romanticQuestion ? " rsvp-card--romantic-result" : ""}`}
        role="status"
      >
        {romanticQuestion ? (
          <span className="rsvp-card__response-mark">
            <RomanticReplyMark answer={attending ? "yes" : "no"} />
          </span>
        ) : null}
        <p className="rsvp-card__eyebrow">Response received</p>
        <h3>
          {romanticQuestion
            ? attending
              ? "Your answer is yes."
              : "Your answer was sent."
            : attending
              ? "We saved your place."
              : "Thank you for letting us know."}
        </h3>
        <p>
          {romanticQuestion
            ? attending
              ? context.response.message
                ? "Your response and optional note have been saved."
                : "Your response has been saved."
              : "Your message was included with your answer."
            : attending
              ? `${context.response.attendeeCount} ${context.response.attendeeCount === 1 ? "guest is" : "guests are"} attending.`
              : "Your party is unable to attend."}
        </p>
        {!romanticQuestion && context.response.message ? (
          <p className="rsvp-card__note">Your note was included.</p>
        ) : null}
        {error ? (
          <p className="rsvp-card__error" role="alert">
            {error}
          </p>
        ) : null}
        {context.status === "open" ? (
          <button
            className="rsvp-card__secondary"
            disabled={submitting}
            onClick={() => {
              setEditing(true);
              setError(undefined);
            }}
            type="button"
          >
            Change response
          </button>
        ) : (
          <p className="rsvp-card__note">
            {deadline ? `Responses closed on ${deadline}.` : "Responses are now closed."}
          </p>
        )}
      </div>
    );
  }

  if (responseMode === "romantic-question") {
    if (romanticMessageAnswer) {
      const answeringYes = romanticMessageAnswer === "attending";
      return (
        <form
          aria-busy={submitting || undefined}
          aria-label={`${answeringYes ? "Yes" : "No"} response for ${question ?? "this invitation"}`}
          className="rsvp-card rq-message-form"
          data-answer={answeringYes ? "yes" : "no"}
          onSubmit={(event) => void submitRomanticAnswer(event)}
        >
          <style>{romanticResponseStyles}</style>
          <fieldset className="rq-message-form__body" disabled={submitting}>
            <div className="rq-form-heading">
              <span className="rq-form-mark">
                <RomanticReplyMark answer={answeringYes ? "yes" : "no"} />
              </span>
              <span className="rq-form-heading-copy">
                <span className="rq-form-kicker">Your reply</span>
                <label className="rq-form-title" htmlFor={romanticMessageId}>
                  {answeringYes ? "Add a note, if you would like." : "Please leave a message."}
                </label>
              </span>
              <span className="rq-form-requirement">{answeringYes ? "Optional" : "Required"}</span>
            </div>
            <div className="rq-message-field">
              <textarea
                id={romanticMessageId}
                maxLength={500}
                onChange={(event) => changeDraft(() => setMessage(event.currentTarget.value))}
                placeholder={
                  answeringYes
                    ? "Write a little note to go with your yes."
                    : "Share what you would like them to know."
                }
                ref={romanticMessageRef}
                required={!answeringYes}
                rows={4}
                value={message}
              />
              <div className="rq-message-meta">
                <small>
                  {answeringYes
                    ? "A note is completely optional."
                    : "A thoughtful message is needed to send No."}
                </small>
                <output aria-label={`${message.length} of 500 characters`}>
                  {message.length}/500
                </output>
              </div>
            </div>
            {error ? (
              <p className="rsvp-card__error" role="alert">
                {error}
              </p>
            ) : null}
            <p aria-atomic="true" aria-live="polite" className="rsvp-card__status">
              {submissionStatus}
            </p>
            <div className="rq-form-actions">
              <button
                className="rq-form-back"
                disabled={submitting}
                onClick={() => changeDraft(() => setRomanticMessageAnswer(null))}
                type="button"
              >
                Back
              </button>
              <button className="rq-form-submit" disabled={submitting} type="submit">
                {submissionStage === "saving"
                  ? longWait
                    ? "Still sending..."
                    : "Sending answer..."
                  : retryingSave
                    ? "Try sending again"
                    : `Send ${answeringYes ? "yes" : "no"}`}
              </button>
            </div>
          </fieldset>
        </form>
      );
    }

    return (
      <fieldset
        aria-busy={submitting || undefined}
        aria-label={question ?? "Choose your answer"}
        className="rsvp-card rsvp-card--choice-fieldset"
        disabled={submitting}
      >
        <RomanticResponseChoices
          declineButtonBehavior={declineButtonBehavior}
          disabled={submitting}
          dodgeCount={declineDodgeCount}
          onDodge={() => setDeclineDodgeCount((current) => current + 1)}
          onNo={chooseRomanticNo}
          onYes={chooseRomanticYes}
        />
        {deadline ? <p className="rsvp-card__deadline">Please answer by {deadline}.</p> : null}
        {error ? (
          <p className="rsvp-card__error" role="alert">
            {error}
          </p>
        ) : null}
        <p aria-atomic="true" aria-live="polite" className="rsvp-card__status">
          {submissionStatus}
        </p>
      </fieldset>
    );
  }

  return (
    <form aria-busy={submitting || undefined} className="rsvp-card" onSubmit={submit}>
      <fieldset disabled={submitting}>
        <legend>Will you be joining us?</legend>
        <div className="rsvp-card__choices">
          <label>
            <input
              checked={attendance === "attending"}
              name="attendance"
              onChange={() => changeDraft(() => setAttendance("attending"))}
              type="radio"
              value="attending"
            />
            Joyfully attending
          </label>
          <label>
            <input
              checked={attendance === "declined"}
              name="attendance"
              onChange={() => changeDraft(() => setAttendance("declined"))}
              type="radio"
              value="declined"
            />
            Regretfully decline
          </label>
        </div>

        {attendance === "attending" ? (
          <label className="rsvp-card__field">
            <span>Guests attending</span>
            <input
              inputMode="numeric"
              max={context.capacity}
              min={1}
              onChange={(event) =>
                changeDraft(() => setAttendeeCount(Number(event.currentTarget.value)))
              }
              required
              type="number"
              value={attendeeCount}
            />
            <small>Up to {context.capacity} for your party.</small>
          </label>
        ) : null}

        <label className="rsvp-card__field">
          <span>
            Message to the hosts <small>(optional)</small>
          </span>
          <textarea
            maxLength={500}
            onChange={(event) => changeDraft(() => setMessage(event.currentTarget.value))}
            rows={4}
            value={message}
          />
          <small>{message.length}/500 characters</small>
        </label>

        {deadline ? <p className="rsvp-card__deadline">Please reply by {deadline}.</p> : null}
        {error ? (
          <p className="rsvp-card__error" role="alert">
            {error}
          </p>
        ) : null}
        <p aria-atomic="true" aria-live="polite" className="rsvp-card__status">
          {submissionStatus}
        </p>

        <div className="rsvp-card__actions">
          {refreshReason ? (
            <button
              className="rsvp-card__primary"
              disabled={submitting}
              onClick={() => void retryRefresh()}
              type="button"
            >
              {submissionStage === "checking"
                ? "Checking latest response..."
                : "Check latest response"}
            </button>
          ) : (
            <button className="rsvp-card__primary" disabled={submitting} type="submit">
              {submissionStage === "saving"
                ? longWait
                  ? "Still saving..."
                  : "Saving response..."
                : retryingSave
                  ? "Try saving again"
                  : context.response
                    ? "Save changes"
                    : "Send response"}
            </button>
          )}
          {context.response && !refreshReason ? (
            <button
              className="rsvp-card__secondary"
              disabled={submitting}
              onClick={() => setEditing(false)}
              type="button"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}
