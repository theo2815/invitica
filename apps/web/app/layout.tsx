import "@fontsource-variable/fraunces/index.css";
import "@fontsource-variable/instrument-sans/index.css";
import { INVITICA_BRAND_FIELD } from "@invitica/renderer";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Invitica — Premium digital invitations",
  description:
    "Create and share beautiful invitation websites for weddings, debuts, birthdays, and meaningful celebrations.",
  manifest: "/manifest.webmanifest",
  // iOS honours the manifest's `display` from 16.4, but older iPhones only read these meta tags,
  // and they are what gives an installed shortcut its name and chrome-free launch.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Invitica",
  },
  // `appleWebApp.capable` emits only the standardized `mobile-web-app-capable` in Next 16. Older
  // iOS reads just the `apple-` prefixed name, and without it an installed shortcut opens in a
  // browser tab instead of launching standalone. The Home Screen icon is unaffected either way.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  // Tints Android Chrome's address bar and the installed app's system chrome.
  themeColor: INVITICA_BRAND_FIELD,
  // Required for `env(safe-area-inset-*)` to report anything but zero. Without it iOS insets the
  // whole web view instead, so an installed app cannot paint its own chrome into the status-bar
  // and home-indicator strips — they stay a dead band in the page background colour. The shell,
  // Guest Desk, photo preview, venue picker, and template dock all already write against these
  // insets; none of that took effect until this line existed.
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-PH">
      <body>{children}</body>
    </html>
  );
}
