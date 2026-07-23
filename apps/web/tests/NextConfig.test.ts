import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../next.config";

afterEach(() => vi.unstubAllEnvs());

describe("Next.js development routing", () => {
  it("proxies guest-viewer routes and assets only during development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual([
      {
        destination: "http://127.0.0.1:8787/i/:path*",
        source: "/i/:path*",
      },
      {
        destination: "http://127.0.0.1:8787/viewer.css",
        source: "/viewer.css",
      },
      {
        destination: "http://127.0.0.1:8787/viewer.js",
        source: "/viewer.js",
      },
      {
        destination: "http://127.0.0.1:8787/fonts/:path*",
        source: "/fonts/:path*",
      },
    ]);

    vi.stubEnv("NODE_ENV", "production");
    await expect(nextConfig.rewrites?.()).resolves.toEqual([]);
  });
});
