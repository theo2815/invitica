import { existsSync, readdirSync } from "node:fs";
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
      { destination: "http://127.0.0.1:8787/chunks/:path*", source: "/chunks/:path*" },
      { destination: "http://127.0.0.1:8787/fonts/:path*", source: "/fonts/:path*" },
      { destination: "http://127.0.0.1:8787/viewer.css", source: "/viewer.css" },
      { destination: "http://127.0.0.1:8787/viewer.js", source: "/viewer.js" },
    ]);
  });

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
        !rewrites.some(({ source }) => source === `/${entry}` || source === `/${entry}/:path*`),
    );

    expect(uncovered).toEqual([]);
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

    expect(headers?.[0]?.source).toBe("/((?!i/|m/|api/public/).*)");
  });
});
