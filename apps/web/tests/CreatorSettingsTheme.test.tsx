import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  setThemePreference: vi.fn(async () => undefined),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet, set: mocks.cookieSet })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../src/server/auth/session", () => ({ requireConfirmedUser: vi.fn() }));

import {
  isThemePreference,
  readThemePreference,
  THEME_COOKIE,
  themeAttribute,
} from "../src/server/account/theme";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("the stored theme preference", () => {
  /**
   * The requirement this asserts: a browser with no cookie — a fresh incognito window, a new
   * device, a creator who has never opened Settings — is light, whatever the operating system
   * prefers. `system` used to be the default and is no longer a value at all, so a cookie carrying
   * it is treated exactly like a tampered one.
   */
  it("falls back to light for a missing, retired, or tampered cookie", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    expect(await readThemePreference()).toBe("light");

    mocks.cookieGet.mockReturnValue({ value: "sepia" });
    expect(await readThemePreference()).toBe("light");

    mocks.cookieGet.mockReturnValue({ value: "system" });
    expect(await readThemePreference()).toBe("light");

    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(false);
    expect(isThemePreference("SEPIA")).toBe(false);
  });

  it("reads the two choices back", async () => {
    mocks.cookieGet.mockReturnValue({ value: "dark" });
    expect(await readThemePreference()).toBe("dark");
    expect(mocks.cookieGet).toHaveBeenCalledWith(THEME_COOKIE);

    mocks.cookieGet.mockReturnValue({ value: "light" });
    expect(await readThemePreference()).toBe("light");
  });

  /**
   * Always an attribute, never absent. There is no `prefers-color-scheme` branch left for an
   * unstamped document to fall into, and stamping the default keeps the served markup readable.
   */
  it("stamps an attribute for both values", () => {
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("light")).toBe("light");
  });
});

describe("saving a theme", () => {
  it("writes an httpOnly cookie for a value it recognizes", async () => {
    const { setThemePreference } = await import("../src/server/account/actions");

    await setThemePreference("dark");

    expect(mocks.cookieSet).toHaveBeenCalledWith(
      THEME_COOKIE,
      "dark",
      expect.objectContaining({ httpOnly: true, path: "/", sameSite: "lax" }),
    );
  });

  it("ignores a value it does not recognize instead of storing it", async () => {
    const { setThemePreference } = await import("../src/server/account/actions");

    await setThemePreference("<script>");
    await setThemePreference(null);
    // Retired along with the media query it used to select. Writing it would store a value
    // `readThemePreference` no longer accepts, quietly resetting the creator to light.
    await setThemePreference("system");

    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

describe("the theme control", () => {
  it("offers exactly two choices as radios, with the stored one selected", async () => {
    vi.doMock("../src/server/account/actions", () => ({
      setThemePreference: mocks.setThemePreference,
    }));
    const { ThemePanel } = await import("../src/components/settings/ThemePanel");

    render(<ThemePanel preference="dark" />);

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /Dark/ })).toHaveProperty("checked", true);
    expect(screen.getByRole("radio", { name: /Light/ })).toHaveProperty("checked", false);
    expect(screen.queryByRole("radio", { name: /System/ })).toBeNull();
  });

  it("saves the choice that was picked", async () => {
    vi.doMock("../src/server/account/actions", () => ({
      setThemePreference: mocks.setThemePreference,
    }));
    const { ThemePanel } = await import("../src/components/settings/ThemePanel");

    render(<ThemePanel preference="dark" />);
    fireEvent.click(screen.getByRole("radio", { name: /Light/ }));

    await waitFor(() => expect(mocks.setThemePreference).toHaveBeenCalledWith("light"));
  });
});
