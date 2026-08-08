"use client";

import { createContext, use } from "react";

import type { ThemePreference } from "../server/account/theme";

/**
 * The active theme, for the handful of things CSS cannot reach.
 *
 * Almost nothing needs this. The palette itself is `data-theme` on `<html>` and twelve custom
 * properties, so every surface in the application follows the theme without reading a value in
 * JavaScript. The exception is the header wordmark, which is a raster: the ink is baked into the
 * file, so the *file* has to change, and only markup can choose a file.
 *
 * Defaults to light, which matches `readThemePreference` for a visitor with no cookie — so a
 * component rendered outside the provider is wrong in no case the application actually produces.
 */
const ThemeContext = createContext<ThemePreference>("light");

export function ThemeProvider({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: ThemePreference;
}) {
  return <ThemeContext value={theme}>{children}</ThemeContext>;
}

export function useTheme(): ThemePreference {
  return use(ThemeContext);
}
