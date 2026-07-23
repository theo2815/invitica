import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithTimeout } from "../src/fetch-with-timeout";

describe("bounded Viewer requests", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts a request after its deadline", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const rejection = expect(fetchWithTimeout("/slow", {}, 250, request)).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(250);

    await rejection;
    expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("forwards a parent cancellation and clears its timeout", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const request = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const result = fetchWithTimeout("/cancelled", { signal: parent.signal }, 5_000, request);
    parent.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
