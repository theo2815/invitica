import "@fontsource-variable/fraunces/index.css";
import "@fontsource-variable/instrument-sans/index.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Invitica — Premium digital invitations",
  description:
    "Create and share beautiful invitation websites for weddings, debuts, birthdays, and meaningful celebrations.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-PH">
      <body>{children}</body>
    </html>
  );
}
