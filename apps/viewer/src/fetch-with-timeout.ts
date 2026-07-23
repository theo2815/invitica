type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  request: FetchRequest = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const parentSignal = init.signal;
  const abortFromParent = () => controller.abort();

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await request(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
