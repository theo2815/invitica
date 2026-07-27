import { INVITICA_BRAND_FIELD, INVITICA_BRAND_GLYPH } from "@invitica/renderer";
import type { MetadataRoute } from "next";

/**
 * Web app manifest for the creator application, served at `/manifest.webmanifest`.
 *
 * This is what makes Android's "Add to Home Screen" produce a real installed icon instead of a
 * bookmark shortcut with a synthesized letter tile. Chrome's install criteria require `name` or
 * `short_name`, `start_url`, a `display` of `standalone` or similar, and icons at both 192 and 512.
 *
 * The `maskable` pair matters as much as the sizes: without it Android composites a `purpose: "any"`
 * icon inside a white badge, so a wine-field mark arrives as a small square floating on white.
 *
 * Deliberately scoped to the creator app only. Published guest invitations are served by the Viewer
 * Worker under `/i/*`, carry `noindex`, and are reached through a single private link — they are not
 * an installable application and must not advertise themselves as one.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: INVITICA_BRAND_GLYPH,
    description:
      "Create and share beautiful invitation websites for weddings, debuts, birthdays, and meaningful celebrations.",
    display: "standalone",
    // A stable application identity, so changing `start_url` later does not register a second app.
    id: "/",
    icons: [
      { purpose: "any", sizes: "192x192", src: "/icons/icon-192.png", type: "image/png" },
      { purpose: "any", sizes: "512x512", src: "/icons/icon-512.png", type: "image/png" },
      { purpose: "maskable", sizes: "192x192", src: "/icons/maskable-192.png", type: "image/png" },
      { purpose: "maskable", sizes: "512x512", src: "/icons/maskable-512.png", type: "image/png" },
    ],
    lang: "en-PH",
    name: "Invitica — Premium digital invitations",
    orientation: "portrait",
    scope: "/",
    short_name: "Invitica",
    // Creators install this to reach their own workspace; an unauthenticated launch redirects to
    // sign-in, which is the correct entry for a closed beta.
    start_url: "/dashboard",
    theme_color: INVITICA_BRAND_FIELD,
  };
}
