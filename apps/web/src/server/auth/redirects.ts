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

  return siteUrl.origin;
}
