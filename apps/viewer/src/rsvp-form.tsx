"use client";

import {
  type GuestRsvpAttendance,
  type GuestRsvpContext,
  type GuestRsvpMutationRequest,
  type GuestRsvpResponse,
  guestRsvpMutationRequestSchema,
  guestRsvpMutationResponseSchema,
} from "@invitica/invitation-schema";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { fetchWithTimeout } from "./fetch-with-timeout";

const RSVP_MUTATION_TIMEOUT_MS = 15_000;

interface RsvpFormProps {
  context: GuestRsvpContext;
  locale: "en-PH" | "fil-PH";
  onRefresh: () => Promise<void>;
  onSaved: (response: GuestRsvpResponse) => void;
  publicIdentifier: string;
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
  locale,
  onRefresh,
  onSaved,
  publicIdentifier,
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
  const [editing, setEditing] = useState(context.response === null);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const retryRequest = useRef<GuestRsvpMutationRequest | undefined>(undefined);

  useEffect(() => {
    const response = context.response;
    setAttendance(response?.attendance ?? "attending");
    setAttendeeCount(response?.attendance === "attending" ? response.attendeeCount : 1);
    setMessage(response?.message ?? "");
    setEditing(response === null);
    retryRequest.current = undefined;
  }, [context.response]);

  function changeDraft(action: () => void) {
    action();
    retryRequest.current = undefined;
    setError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    let request = retryRequest.current;
    if (!request) {
      const parsed = guestRsvpMutationRequestSchema.safeParse({
        attendance,
        attendeeCount: attendance === "attending" ? attendeeCount : 0,
        expectedRevision: context.response?.revision ?? 0,
        message,
        mutationId: crypto.randomUUID(),
        publicIdentifier,
        token,
      });

      if (!parsed.success) {
        setError(
          attendance === "attending"
            ? `Choose a party size from 1 to ${context.capacity}.`
            : "Review your response and try again.",
        );
        return;
      }
      request = parsed.data;
    }

    if (request.attendance === "attending" && request.attendeeCount > context.capacity) {
      setError(`Choose a party size from 1 to ${context.capacity}.`);
      return;
    }

    retryRequest.current = request;
    setSubmitting(true);

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
        onSaved(parsed.data.response);
        setEditing(false);
        return;
      }

      const result = (await response.json().catch(() => null)) as { status?: unknown } | null;
      if (response.status === 409 || result?.status === "conflict") {
        retryRequest.current = undefined;
        await onRefresh();
        setError(
          "Your response changed elsewhere. Review the latest response before saving again.",
        );
      } else if (response.status === 410 || result?.status === "closed") {
        retryRequest.current = undefined;
        await onRefresh();
        setError("Responses are now closed for this invitation.");
      } else if (response.status === 400 || result?.status === "invalid") {
        retryRequest.current = undefined;
        setError("Review your response and try again.");
      } else if (response.status === 404) {
        retryRequest.current = undefined;
        setError("This personalized response link is no longer available.");
      } else {
        setError("Your response could not be saved. Try again.");
      }
    } catch {
      setError("Your response could not be saved. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const deadline = deadlineLabel(context.deadline, locale, timezone);

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
    return (
      <div className="rsvp-card rsvp-card--centered" role="status">
        <p className="rsvp-card__eyebrow">Response received</p>
        <h3>{attending ? "We saved your place." : "Thank you for letting us know."}</h3>
        <p>
          {attending
            ? `${context.response.attendeeCount} ${context.response.attendeeCount === 1 ? "guest is" : "guests are"} attending.`
            : "Your party is unable to attend."}
        </p>
        {context.response.message ? (
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

  return (
    <form aria-busy={submitting} className="rsvp-card" onSubmit={submit}>
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

        <div className="rsvp-card__actions">
          <button className="rsvp-card__primary" disabled={submitting} type="submit">
            {submitting
              ? "Saving response..."
              : context.response
                ? "Save changes"
                : "Send response"}
          </button>
          {context.response ? (
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
