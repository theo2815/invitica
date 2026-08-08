import { cookies } from "next/headers";

/**
 * The creator's theme choice.
 *
 * Two values, and **light is the default**. Invitica deliberately does not follow
 * `prefers-color-scheme`: a first visit — including a fresh incognito window — is always the cream
 * paper, and the palette changes only when someone picks the other one in Settings. A device set
 * to dark at the OS level is not a statement about this product.
 *
 * The choice is stamped onto `<html>` by the root layout, read from this cookie on the server — so
 * there is no inline script, no `useEffect`, and no frame in which a creator who chose dark sees a
 * cream page.
 */
export type ThemePreference = "dark" | "light";

export const THEME_COOKIE = "invitica-theme";

/** One year. A theme is a standing preference, not a session. */
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light";
}

export function themeCookieOptions() {
  return {
    // Read only by the server that stamps the attribute. Nothing in the browser needs it, and it
    // reveals a preference rather than anything about the account.
    httpOnly: true,
    maxAge: THEME_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

/** No cookie, or one that has been tampered with, is light — never the device's preference. */
export async function readThemePreference(): Promise<ThemePreference> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isThemePreference(value) ? value : "light";
}

/**
 * What `<html data-theme>` should carry. Always one of the two, never absent: `globals.css` has no
 * `prefers-color-scheme` branch to fall back to, and stamping the answer even when it matches the
 * default keeps the served markup self-describing for anyone reading it.
 */
export function themeAttribute(preference: ThemePreference): "dark" | "light" {
  return preference;
}
