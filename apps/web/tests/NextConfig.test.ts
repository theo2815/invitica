import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../next.config";

// The viewer origin is resolved once at module load, so a test that changes it has
// to re-import the config rather than only stubbing the environment.
async function loadConfig(): Promise<typeof nextConfig> {
  vi.resetModules();
  return (await import("../next.config")).default;
}

afterEach(() => vi.unstubAllEnvs());

describe("guest-lane routing", () => {
  it("proxies published pages, immutable media, and viewer assets to the local viewer by default", async () => {
    await expect(nextConfig.rewrites?.()).resolves.toEqual([
      { destination: "http://127.0.0.1:8787/i/:path*", source: "/i/:path*" },
      { destination: "http://127.0.0.1:8787/m/:path*", source: "/m/:path*" },
      { destination: "http://127.0.0.1:8787/s/:path*", source: "/s/:path*" },
      { destination: "http://127.0.0.1:8787/chunks/:path*", source: "/chunks/:path*" },
      { destination: "http://127.0.0.1:8787/fonts/:path*", source: "/fonts/:path*" },
      { destination: "http://127.0.0.1:8787/viewer.css", source: "/viewer.css" },
      { destination: "http://127.0.0.1:8787/viewer.js", source: "/viewer.js" },
    ]);
  });

  // Assets the viewer ships that must NOT be rewritten, because this app serves its own copy at
  // the same path. `apple-touch-icon.png` is deliberately duplicated: a guest invitation is
  // reachable both at `invitica.app/i/*`, where Next answers, and at the Worker's own origin,
  // where its asset directory does. Rewriting it would make the creator app's Home Screen icon
  // depend on the Viewer being reachable.
  const servedByBothOrigins = ["apple-touch-icon.png"];

  // An asset the viewer emits but this list does not cover fails silently: Next answers
  // its own 404, the guest page loads, and only the card never opens. That is how
  // `chunks/` — the dynamically imported map — was missed.
  it("covers every top-level asset the viewer build emits", async () => {
    const clientRoot = resolve(__dirname, "../../viewer/dist/client");
    if (!existsSync(clientRoot)) return;

    // `rewrites()` may return a bare array or the phased object; this config returns the
    // bare array, but the declared type covers both.
    const declared = (await nextConfig.rewrites?.()) ?? [];
    const rewrites = Array.isArray(declared) ? declared : (declared.afterFiles ?? []);
    const uncovered = readdirSync(clientRoot).filter(
      (entry) =>
        !servedByBothOrigins.includes(entry) &&
        !rewrites.some(({ source }) => source === `/${entry}` || source === `/${entry}/:path*`),
    );

    expect(uncovered).toEqual([]);
  });

  // The exception above is only safe while this app really does serve the file itself.
  it("serves its own copy of every asset excluded from the rewrite list", () => {
    for (const asset of servedByBothOrigins) {
      expect(existsSync(resolve(__dirname, "../public", asset))).toBe(true);
    }
  });

  it("sends the guest lane to the deployed worker when an origin is configured", async () => {
    vi.stubEnv("INVITICA_VIEWER_ORIGIN", "https://viewer.example.workers.dev");

    const rewrites = await (await loadConfig()).rewrites?.();

    expect(rewrites).toContainEqual({
      destination: "https://viewer.example.workers.dev/m/:path*",
      source: "/m/:path*",
    });
    expect(rewrites).toContainEqual({
      destination: "https://viewer.example.workers.dev/i/:path*",
      source: "/i/:path*",
    });
    expect(rewrites).toContainEqual({
      destination: "https://viewer.example.workers.dev/s/:path*",
      source: "/s/:path*",
    });
  });

  // A missing origin in production is silent at runtime: guest pages render and only
  // the reply section is absent, because `/api/public/*` is same-origin here.
  it("fails a production deployment that has no viewer origin", async () => {
    vi.stubEnv("VERCEL_ENV", "production");

    await expect((await loadConfig()).rewrites?.()).rejects.toThrow(/INVITICA_VIEWER_ORIGIN/);
  });

  it("still builds outside a production deployment so the repository gate runs", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");

    await expect((await loadConfig()).rewrites?.()).resolves.toBeInstanceOf(Array);
  });
});

describe("creator security headers", () => {
  it("applies the creator header set", async () => {
    const headers = await nextConfig.headers?.();

    expect(headers).toHaveLength(1);
    expect(headers?.[0]?.headers.map((header) => header.key).sort()).toEqual([
      "cross-origin-opener-policy",
      "permissions-policy",
      "referrer-policy",
      "strict-transport-security",
      "x-content-type-options",
      "x-frame-options",
    ]);
  });

  // The viewer owns its own CSP and immutable media cache, and the public guest
  // endpoints answer the stricter `no-referrer`. Neither may be overridden here.
  it("excludes the viewer lane and the public guest endpoints", async () => {
    const headers = await nextConfig.headers?.();

    expect(headers?.[0]?.source).toBe("/((?!i/|m/|s/|api/public/).*)");
  });
});

/**
 * Google un-verifies a domain the moment its verification file stops resolving, and losing that
 * verification takes the OAuth consent screen's name and logo with it — the consent screen falls
 * back to showing the Supabase host. The file is 53 bytes of text with no build step and nothing
 * importing it, which makes it exactly the kind of thing a future cleanup deletes.
 */
describe("Google Search Console domain verification", () => {
  const verificationFile = "googlef9ad63811ae220a8.html";

  it("serves the verification file from the public root, unrewritten", async () => {
    const path = resolve(import.meta.dirname, "..", "public", verificationFile);
    expect(existsSync(path), `${verificationFile} must stay in apps/web/public`).toBe(true);

    // Google matches the body exactly; a trailing newline or a wrapper fails the check.
    expect(readFileSync(path, "utf8")).toBe(`google-site-verification: ${verificationFile}`);

    // No rewrite may shadow it, or the deployed site answers the Viewer instead of the file.
    const rewrites = await nextConfig.rewrites?.();
    const shadowed = (Array.isArray(rewrites) ? rewrites : []).some((rewrite) =>
      `/${verificationFile}`.startsWith(rewrite.source.replace(/:path\*$/, "")),
    );
    expect(shadowed).toBe(false);
  });
});
