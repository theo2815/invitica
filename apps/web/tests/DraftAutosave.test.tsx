import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTOSAVE_DELAY_MS,
  type DraftSaveOutcome,
  SAVE_TIMEOUT_MS,
  useDraftAutosave,
} from "../src/components/invitations/useDraftAutosave";

const invitationId = "71000000-0000-4000-8000-000000000009";

/**
 * The editable content is a plain string here, so the change signature and the
 * submitted payload are the same value. Both real editors serialize their own state
 * into that pair; the state machine under test does not care which.
 */
function Harness({
  initialRevision = 1,
  save,
  valid = true,
}: {
  initialRevision?: number;
  save: (input: { expectedRevision: number; payload: string }) => Promise<DraftSaveOutcome>;
  valid?: boolean;
}) {
  const [content, setContent] = useState("first");
  const autosave = useDraftAutosave<string>({
    initialRevision,
    invitationId,
    payload: valid ? content : null,
    save,
    signature: content,
  });

  return (
    <div>
      <span data-testid="status">{autosave.status}</span>
      <span data-testid="message">{autosave.message ?? ""}</span>
      <span data-testid="revision">{String(autosave.revision)}</span>
      <span data-testid="retry">{String(autosave.retryAttempt)}</span>
      <span data-testid="recovered">{autosave.recoveredContent ?? ""}</span>
      <button
        onClick={() => {
          setContent((current) => `${current}+`);
          autosave.markEdited();
        }}
        type="button"
      >
        edit
      </button>
      <button onClick={autosave.saveNow} type="button">
        save now
      </button>
      <button onClick={autosave.discardRecoveredSnapshot} type="button">
        discard
      </button>
    </div>
  );
}

function status() {
  return screen.getByTestId("status").textContent;
}

function edit() {
  fireEvent.click(screen.getByRole("button", { name: "edit" }));
}

/** Advances past the autosave debounce so a queued save actually starts. */
async function settleAutosave() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
  });
}

function neverSettles(): Promise<DraftSaveOutcome> {
  return new Promise<DraftSaveOutcome>(() => {});
}

function deferred() {
  let resolve!: (outcome: DraftSaveOutcome) => void;
  const promise = new Promise<DraftSaveOutcome>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe("draft autosave state machine", () => {
  it("saves after the idle delay and reports the new revision", async () => {
    const save = vi.fn().mockResolvedValue({ revision: 2, status: "saved" });
    render(<Harness save={save} />);

    edit();
    expect(status()).toBe("unsaved");
    await settleAutosave();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toEqual({ expectedRevision: 1, payload: "first+" });
    expect(status()).toBe("saved");
    expect(screen.getByTestId("revision").textContent).toBe("2");
  });

  // The defect this whole state machine was rebuilt for: a save that never answers
  // used to leave the editor on "Saving…" permanently, which also disabled autosave,
  // Save now, and the retry notice. Reloading the page was the only way out.
  it("recovers from a save that never answers instead of staying stuck", async () => {
    const save = vi.fn(neverSettles);
    render(<Harness save={save} />);

    edit();
    await settleAutosave();
    expect(status()).toBe("saving");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS);
    });

    expect(status()).toBe("error");
    expect(screen.getByTestId("message").textContent).toContain("Your changes are still here");

    // The editor is genuinely usable again: a retry issues a real second request.
    fireEvent.click(screen.getByRole("button", { name: "save now" }));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("retries a failure the server reports as retryable, then succeeds", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ message: "Try again.", retryable: true, status: "error" })
      .mockResolvedValueOnce({ revision: 3, status: "saved" });
    render(<Harness save={save} />);

    edit();
    await settleAutosave();

    expect(save).toHaveBeenCalledTimes(1);
    expect(status()).toBe("saving");
    expect(screen.getByTestId("retry").textContent).toBe("1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(status()).toBe("saved");
    expect(screen.getByTestId("revision").textContent).toBe("3");
  });

  it("stops after the retry budget and keeps the failure on screen", async () => {
    const save = vi.fn().mockResolvedValue({
      message: "Your latest changes could not be saved. Try again.",
      retryable: true,
      status: "error",
    });
    render(<Harness save={save} />);

    edit();
    await settleAutosave();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000 + 3_000 + 9_000);
    });

    // Three backoffs plus the original attempt, and then it stops rather than looping.
    expect(save).toHaveBeenCalledTimes(4);
    expect(status()).toBe("error");
  });

  it("never retries a conflict, because the draft really did move on", async () => {
    const save = vi.fn().mockResolvedValue({ message: "Reload first.", status: "conflict" });
    render(<Harness save={save} />);

    edit();
    await settleAutosave();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(status()).toBe("conflict");
  });

  it("keeps a conflict on screen when the creator carries on editing", async () => {
    const save = vi.fn().mockResolvedValue({ message: "Reload first.", status: "conflict" });
    render(<Harness save={save} />);

    edit();
    await settleAutosave();
    expect(status()).toBe("conflict");

    edit();
    await settleAutosave();

    // An unresolved conflict is not cleared by typing, and no further write is sent.
    expect(status()).toBe("conflict");
    expect(save).toHaveBeenCalledTimes(1);
  });

  // Two writes against one revision would make the database reject the second as a
  // conflict the creator never caused. The previous editors used their visible status
  // as the lock, so an edit made mid-save did exactly that.
  it("does not start a second save while one is in flight, and does not lose it", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ revision: 3, status: "saved" });
    render(<Harness save={save} />);

    edit();
    await settleAutosave();
    expect(save).toHaveBeenCalledTimes(1);

    edit();
    await settleAutosave();
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({ revision: 2, status: "saved" });
    });

    // The content moved on while the first save was in flight, so the editor knows it
    // is dirty again and schedules the queued write against the new revision.
    expect(status()).toBe("unsaved");
    await settleAutosave();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0]).toEqual({ expectedRevision: 2, payload: "first++" });
  });

  it("pauses autosave while the content is incomplete", async () => {
    const save = vi.fn().mockResolvedValue({ revision: 2, status: "saved" });
    render(<Harness save={save} valid={false} />);

    edit();
    await settleAutosave();

    expect(save).not.toHaveBeenCalled();
    expect(status()).toBe("unsaved");
  });

  it("offers content recovered from an interrupted session at the same revision", async () => {
    window.sessionStorage.setItem(
      `invitica:draft-recovery:${invitationId}`,
      JSON.stringify({
        content: "rescued",
        revision: 1,
        savedAt: new Date().toISOString(),
        version: 1,
      }),
    );

    const save = vi.fn().mockResolvedValue({ revision: 2, status: "saved" });
    render(<Harness save={save} />);

    expect(screen.getByTestId("recovered").textContent).toBe("rescued");

    fireEvent.click(screen.getByRole("button", { name: "discard" }));
    expect(screen.getByTestId("recovered").textContent).toBe("");
    expect(window.sessionStorage.getItem(`invitica:draft-recovery:${invitationId}`)).toBeNull();
  });

  it("ignores a snapshot taken against a revision that has since moved on", () => {
    window.sessionStorage.setItem(
      `invitica:draft-recovery:${invitationId}`,
      JSON.stringify({
        content: "stale",
        revision: 1,
        savedAt: new Date().toISOString(),
        version: 1,
      }),
    );

    render(<Harness initialRevision={4} save={vi.fn()} />);

    // Reapplying it would silently revert whatever was saved in between.
    expect(screen.getByTestId("recovered").textContent).toBe("");
    expect(window.sessionStorage.getItem(`invitica:draft-recovery:${invitationId}`)).toBeNull();
  });

  it("stores content the server never accepted, then clears it once saved", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ revision: 2, status: "saved" });
    render(<Harness save={save} />);

    edit();
    await settleAutosave();

    // The write is in flight and nothing is acknowledged, so the snapshot is the only
    // copy of this edit that would survive the tab closing.
    const stored = window.sessionStorage.getItem(`invitica:draft-recovery:${invitationId}`);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ content: "first+", revision: 1 });

    await act(async () => {
      first.resolve({ revision: 2, status: "saved" });
    });

    // Acknowledged content needs no rescue copy.
    expect(window.sessionStorage.getItem(`invitica:draft-recovery:${invitationId}`)).toBeNull();
  });
});
