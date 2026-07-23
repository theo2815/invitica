type ViewRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function recordPublicationView(
  publicIdentifier: string,
  request: ViewRequest = fetch,
): Promise<void> {
  try {
    await request("/api/public/view", {
      body: JSON.stringify({ publicIdentifier }),
      cache: "no-store",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
      referrerPolicy: "no-referrer",
    });
  } catch {
    // Metrics are optional; published invitation reading must remain independent.
  }
}
