import type { NextConfig } from "next";

// The guest lane is served by the Viewer Worker: `/i/*` published pages, `/m/*`
// immutable media, and the Viewer's own client assets. Guest JavaScript then calls
// `/api/public/*`, which lives here, **same-origin**. Without one origin in front of
// both, a published invitation still renders but offers no reply section, so these
// rewrites are a functional requirement rather than a convenience.
const viewerOrigin =
  process.env.INVITICA_VIEWER_ORIGIN ??
  process.env.INVITICA_VIEWER_DEV_ORIGIN ??
  "http://127.0.0.1:8787";

// Two surfaces already set their own stricter headers and are excluded below so
// this set cannot override them: the Viewer Worker behind `/i/*` and `/m/*`, which
// owns its CSP and immutable media cache, and the `/api/public/*` guest endpoints,
// which answer `no-referrer` rather than the creator app's
// `strict-origin-when-cross-origin` so an invitation path never rides outbound.
const securityHeaders = [
  { key: "cross-origin-opener-policy", value: "same-origin" },
  {
    key: "permissions-policy",
    value:
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  },
  { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
  { key: "strict-transport-security", value: "max-age=31536000; includeSubDomains" },
  { key: "x-content-type-options", value: "nosniff" },
  { key: "x-frame-options", value: "DENY" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // sharp is a native module used by media processing server actions; keep it
  // external so it is required at runtime rather than bundled.
  serverExternalPackages: ["sharp"],
  experimental: {
    // Creator image uploads travel through a Server Action; raise the default
    // 1 MB body limit to cover the accepted original-upload ceiling.
    serverActions: { bodySizeLimit: "16mb" },
  },
  async headers() {
    return [{ headers: securityHeaders, source: "/((?!i/|m/|api/public/).*)" }];
  },
  async rewrites() {
    // A missing origin on a real production deployment is silent: guest pages load
    // and only the reply section is absent. Fail the deployment instead. Local and
    // CI production builds are unaffected, so the repository gate still runs.
    if (process.env.VERCEL_ENV === "production" && !process.env.INVITICA_VIEWER_ORIGIN) {
      throw new Error(
        "INVITICA_VIEWER_ORIGIN must be set for a production deployment. Without it `/i/*` and `/m/*` never reach the Viewer Worker, and published invitations render with no reply section.",
      );
    }

    // Everything below `/i/*` and `/m/*` is the Viewer's client bundle, and this list
    // must cover every top-level entry of `apps/viewer/dist/client` — currently
    // `chunks/`, `fonts/`, `viewer.css`, and `viewer.js`. A missing entry does not
    // fail the build: Next answers its own 404 and the guest card silently never
    // opens. `chunks/` holds the dynamically imported map (ADR-006).
    return [
      { destination: `${viewerOrigin}/i/:path*`, source: "/i/:path*" },
      { destination: `${viewerOrigin}/m/:path*`, source: "/m/:path*" },
      { destination: `${viewerOrigin}/chunks/:path*`, source: "/chunks/:path*" },
      { destination: `${viewerOrigin}/fonts/:path*`, source: "/fonts/:path*" },
      { destination: `${viewerOrigin}/viewer.css`, source: "/viewer.css" },
      { destination: `${viewerOrigin}/viewer.js`, source: "/viewer.js" },
    ];
  },
};

export default nextConfig;
