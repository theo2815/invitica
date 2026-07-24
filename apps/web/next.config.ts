import type { NextConfig } from "next";

const viewerDevOrigin = process.env.INVITICA_VIEWER_DEV_ORIGIN ?? "http://127.0.0.1:8787";

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
