"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearDraftSnapshot,
  readDraftSnapshot,
  writeDraftSnapshot,
} from "../../lib/invitations/draft-recovery";

export const AUTOSAVE_DELAY_MS = 800;

/**
 * A save that has not answered by now is treated as unfinished rather than
 * in-progress. Without this bound the editor could sit on "Saving…" forever, and
 * because the previous state machine used that same value as its concurrency lock,
 * a single stalled request disabled autosave, the Save now button, and the retry
 * notice at once — reloading the page was the only way out.
 */
export const SAVE_TIMEOUT_MS = 15_000;

/** Backoff for failures the server has positively reported as retryable. */
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000] as const;

export type DraftSaveStatus = "conflict" | "error" | "saved" | "saving" | "unsaved";

/**
 * `retryable` is the server's own statement that nothing was written and the same
 * request may be sent again. It is never inferred from a transport failure, because
 * a request that fails in flight may still have been applied.
 */
export type DraftSaveOutcome =
  | { readonly revision: number; readonly status: "saved" }
  | {
      readonly message: string;
      readonly retryable?: boolean;
      readonly status: "conflict" | "error";
    };

const TIMEOUT_MESSAGE =
  "Saving is taking longer than expected, so it was stopped. Your changes are still here — try again.";
const TRANSPORT_MESSAGE = "Check your connection and try saving again.";

class DraftSaveTimeoutError extends Error {
  constructor() {
    super("The draft save timed out.");
    this.name = "DraftSaveTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new DraftSaveTimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export interface UseDraftAutosaveOptions<TPayload> {
  readonly initialRevision: number;
  readonly invitationId: string;
  /**
   * The payload to submit, or null while the editor's content is incomplete.
   * Autosave pauses rather than sending something the contract would reject.
   */
  readonly payload: TPayload | null;
  readonly save: (input: {
    readonly expectedRevision: number;
    readonly payload: TPayload;
  }) => Promise<DraftSaveOutcome>;
  /** Stable serialization of the editable content; also the recovery snapshot body. */
  readonly signature: string;
}

export interface DraftAutosave {
  readonly canSaveNow: boolean;
  /** Serialized content found in session storage after an interrupted session. */
  readonly discardRecoveredSnapshot: () => void;
  /**
   * Settles the draft before the editor is navigated away from, and resolves once there is
   * nothing left in flight.
   *
   * Autosave waits 800 ms before it sends anything, so a creator who types and immediately
   * leaves has changes that exist only on screen. `saveNow` cannot be awaited and a click
   * handler cannot wait on a debounce, so a caller that navigates needs this instead.
   *
   * It resolves rather than rejects on failure: the creator asked to go somewhere, and a
   * save that did not land is already reported by the editor's own status. Holding them on
   * a page to re-report it would be a second, worse failure.
   */
  readonly flush: () => Promise<void>;
  readonly isSaved: boolean;
  readonly markEdited: () => void;
  readonly message: string | null;
  readonly recoveredContent: string | null;
  readonly revision: number;
  readonly retryAttempt: number;
  readonly saveNow: () => void;
  readonly status: DraftSaveStatus;
}

export function useDraftAutosave<TPayload>({
  initialRevision,
  invitationId,
  payload,
  save,
  signature,
}: UseDraftAutosaveOptions<TPayload>): DraftAutosave {
  const [status, setStatus] = useState<DraftSaveStatus>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [revision, setRevision] = useState(initialRevision);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [lastSavedSignature, setLastSavedSignature] = useState(signature);
  const [recoveredContent, setRecoveredContent] = useState<string | null>(null);

  /**
   * The real concurrency lock. Kept separate from `status` so a stalled request can
   * never make the editor unrecoverable, and so an edit made mid-save cannot start a
   * second write against the same revision — which the database would reject as a
   * conflict the creator did not cause.
   *
   * A save blocked by this lock is not lost: the in-flight save always settles into a
   * status change, and when the content has moved on that status is `unsaved`, which
   * reschedules autosave.
   */
  const inFlight = useRef(false);
  const latestSignature = useRef(signature);
  latestSignature.current = signature;
  const saveRef = useRef(save);
  saveRef.current = save;

  /**
   * `flush` runs from another component's click handler, so it cannot read state through a
   * closure that a render has not refreshed yet. These mirror the four values it needs, and
   * `runSave` updates the two it owns the moment it knows them rather than waiting for the
   * re-render, so a flush that follows a completed save does not send it a second time.
   */
  const pendingSave = useRef<null | Promise<void>>(null);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const statusRef = useRef(status);
  statusRef.current = status;
  const lastSavedSignatureRef = useRef(lastSavedSignature);
  lastSavedSignatureRef.current = lastSavedSignature;

  // Offer recovery only for content edited against the revision now on screen. A
  // snapshot from an older revision cannot be reapplied without silently reverting
  // whatever was saved since.
  useEffect(() => {
    const snapshot = readDraftSnapshot(invitationId);
    if (!snapshot) return;
    if (snapshot.revision !== initialRevision || snapshot.content === latestSignature.current) {
      clearDraftSnapshot(invitationId);
      return;
    }
    setRecoveredContent(snapshot.content);
  }, [initialRevision, invitationId]);

  // Debounced so a long document is not re-serialized into session storage on every
  // keystroke; a mid-range phone would feel that as typing lag.
  useEffect(() => {
    if (signature === lastSavedSignature) {
      clearDraftSnapshot(invitationId);
      return;
    }

    const timer = window.setTimeout(
      () => writeDraftSnapshot(invitationId, signature, revision),
      AUTOSAVE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [invitationId, lastSavedSignature, revision, signature]);

  const runSave = useCallback(
    async (submittedPayload: TPayload, submittedSignature: string, expectedRevision: number) => {
      if (inFlight.current) return;
      inFlight.current = true;

      setMessage(null);
      setRetryAttempt(0);
      setStatus("saving");

      try {
        for (let attempt = 0; ; attempt += 1) {
          let outcome: DraftSaveOutcome;
          try {
            // `withTimeout` stops waiting; it cannot cancel the request. A late answer
            // is simply never observed, so it can no longer overwrite newer state.
            outcome = await withTimeout(
              saveRef.current({ expectedRevision, payload: submittedPayload }),
              SAVE_TIMEOUT_MS,
            );
          } catch (error: unknown) {
            // A request that timed out or failed in flight may still have been
            // applied, so it is never retried automatically. The creator retries
            // deliberately, and a resulting conflict is then reported honestly.
            setMessage(
              error instanceof DraftSaveTimeoutError ? TIMEOUT_MESSAGE : TRANSPORT_MESSAGE,
            );
            setStatus("error");
            return;
          }

          if (outcome.status === "saved") {
            revisionRef.current = outcome.revision;
            lastSavedSignatureRef.current = submittedSignature;
            setRevision(outcome.revision);
            setLastSavedSignature(submittedSignature);
            setStatus(latestSignature.current === submittedSignature ? "saved" : "unsaved");
            return;
          }

          if (outcome.retryable !== true || attempt >= RETRY_DELAYS_MS.length) {
            setMessage(outcome.message);
            setStatus(outcome.status);
            return;
          }

          setRetryAttempt(attempt + 1);
          await delay(RETRY_DELAYS_MS[attempt] ?? 0);
        }
      } finally {
        inFlight.current = false;
        setRetryAttempt(0);
      }
    },
    [],
  );

  const markEdited = useCallback(() => {
    setMessage(null);
    // A conflict is unresolved until the creator reloads or discards, so editing
    // does not clear it. Every other state yields to the new edit, including a
    // save that is still in flight — its answer is superseded, not awaited.
    setStatus((current) => (current === "conflict" ? current : "unsaved"));
  }, []);

  const dirty = signature !== lastSavedSignature;
  const canSaveNow = dirty && payload !== null && status !== "conflict";

  useEffect(() => {
    if (!dirty || payload === null) return;
    if (status === "conflict" || status === "error" || status === "saving") return;

    const submittedPayload = payload;
    const submittedSignature = signature;
    const expectedRevision = revision;
    const timer = window.setTimeout(() => {
      pendingSave.current = runSave(submittedPayload, submittedSignature, expectedRevision);
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [dirty, payload, revision, runSave, signature, status]);

  const saveNow = useCallback(() => {
    if (payload === null || status === "conflict") return;
    // Deliberately not gated on `status === "saving"`: that is what made a stalled
    // save unrecoverable. `inFlight` inside `runSave` prevents the duplicate request.
    pendingSave.current = runSave(payload, latestSignature.current, revision);
  }, [payload, revision, runSave, status]);

  const flush = useCallback(async () => {
    // Wait out whatever is already going, so the check below reads a settled revision
    // rather than racing the request that is about to change it.
    await pendingSave.current?.catch(() => undefined);

    const stillDirty = latestSignature.current !== lastSavedSignatureRef.current;
    if (!stillDirty || payloadRef.current === null || statusRef.current === "conflict") return;

    // The debounce may never have fired — this is the common case, a creator who typed and
    // left inside 800 ms — so the save that autosave was going to make happens here instead.
    pendingSave.current = runSave(payloadRef.current, latestSignature.current, revisionRef.current);
    await pendingSave.current.catch(() => undefined);
  }, [runSave]);

  useEffect(() => {
    if (!dirty) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
    const guardCreatorLink = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target || target.download) return;
      if (new URL(target.href, window.location.href).origin !== window.location.origin) return;
      if (
        !window.confirm("Your latest invitation changes are not saved. Leave this page anyway?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);
    window.document.addEventListener("click", guardCreatorLink, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      window.document.removeEventListener("click", guardCreatorLink, true);
    };
  }, [dirty]);

  const discardRecoveredSnapshot = useCallback(() => {
    clearDraftSnapshot(invitationId);
    setRecoveredContent(null);
  }, [invitationId]);

  return {
    canSaveNow,
    discardRecoveredSnapshot,
    flush,
    isSaved: status === "saved" && !dirty,
    markEdited,
    message,
    recoveredContent,
    revision,
    retryAttempt,
    saveNow,
    status,
  };
}
