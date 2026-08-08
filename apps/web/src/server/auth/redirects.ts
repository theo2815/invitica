export function getSafeNextPath(value: string | null, fallback = "/dashboard"): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const base = new URL("https://invitica.invalid");
    const candidate = new URL(value, base);

    if (candidate.origin !== base.origin) {
      return fallback;
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}

// Three hostnames, deliberately duplicated from `server/guests/guests.ts` rather than imported:
// that module pulls the whole guest domain in behind it, and this one is on the sign-in path.
function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function getSiteOrigin(value = process.env.NEXT_PUBLIC_SITE_URL): string {
  if (!value) {
    throw new Error(
      "Invitica's site URL is not configured. Set NEXT_PUBLIC_SITE_URL in apps/web/.env.local.",
    );
  }

  const siteUrl = new URL(value);
  const isHttp = siteUrl.protocol === "http:" || siteUrl.protocol === "https:";
  const isOriginOnly =
    siteUrl.username === "" &&
    siteUrl.password === "" &&
    siteUrl.pathname === "/" &&
    siteUrl.search === "" &&
    siteUrl.hash === "";

  if (!isHttp || !isOriginOnly) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTP or HTTPS origin without a path.");
  }

  // This origin builds the OAuth `redirectTo`, and Supabase matches that against its Redirect URLs
  // allowlist **exactly, scheme included**. A hosted `http://` value therefore does not fail
  // loudly: GoTrue silently falls back to the project's Site URL, and the creator lands on the
  // landing page carrying an unused `?code=` instead of reaching their dashboard. That happened on
  // invitica.app on 2026-08-08, and the provider variable is fixed separately — this makes the
  // wrong value unable to cause it again. Same defence `NEXT_PUBLIC_INVITATION_ORIGIN` already has
  // in `server/guests/guests.ts`; only a local development host stays plaintext.
  if (siteUrl.protocol === "http:" && !isLocalHost(siteUrl.hostname)) {
    console.warn(
      JSON.stringify({ event: "site_origin_upgraded_to_https", hostname: siteUrl.hostname }),
    );
    siteUrl.protocol = "https:";
  }

  return siteUrl.origin;
}
