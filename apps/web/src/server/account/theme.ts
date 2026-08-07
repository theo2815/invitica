import { cookies } from "next/headers";

/**
 * The creator's theme choice.
 *
 * `system` is the default and stores nothing on the document: `globals.css` answers it with
 * `prefers-color-scheme`, which is CSS and therefore already correct on the first paint. The two
 * explicit values are stamped onto `<html>` by the root layout, read from this cookie on the
 * server — so there is no inline script, no `useEffect`, and no frame in which a creator who
 * chose dark sees a cream page.
 */
export type ThemePreference = "dark" | "light" | "system";

export const THEME_COOKIE = "invitica-theme";

/** One year. A theme is a standing preference, not a session. */
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
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

export async function readThemePreference(): Promise<ThemePreference> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isThemePreference(value) ? value : "system";
}

/** What `<html data-theme>` should carry. `system` carries nothing, so the media query decides. */
export function themeAttribute(preference: ThemePreference): "dark" | "light" | undefined {
  return preference === "system" ? undefined : preference;
}
