import type { NextConfig } from "next";

const viewerDevOrigin = process.env.INVITICA_VIEWER_DEV_ORIGIN ?? "http://127.0.0.1:8787";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];

    return [
      { destination: `${viewerDevOrigin}/i/:path*`, source: "/i/:path*" },
      { destination: `${viewerDevOrigin}/viewer.css`, source: "/viewer.css" },
      { destination: `${viewerDevOrigin}/viewer.js`, source: "/viewer.js" },
      { destination: `${viewerDevOrigin}/fonts/:path*`, source: "/fonts/:path*" },
    ];
  },
};

export default nextConfig;
