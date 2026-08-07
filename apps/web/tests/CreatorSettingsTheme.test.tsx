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
  it("falls back to system for a missing or tampered cookie", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    expect(await readThemePreference()).toBe("system");

    mocks.cookieGet.mockReturnValue({ value: "sepia" });
    expect(await readThemePreference()).toBe("system");

    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("SEPIA")).toBe(false);
  });

  it("reads the two explicit choices back", async () => {
    mocks.cookieGet.mockReturnValue({ value: "dark" });
    expect(await readThemePreference()).toBe("dark");
    expect(mocks.cookieGet).toHaveBeenCalledWith(THEME_COOKIE);

    mocks.cookieGet.mockReturnValue({ value: "light" });
    expect(await readThemePreference()).toBe("light");
  });

  /**
   * System must stamp nothing. The attribute is what an explicit choice uses to beat
   * `prefers-color-scheme`; writing `data-theme="system"` would match neither CSS branch and
   * pin every creator to the light palette.
   */
  it("stamps an attribute only for an explicit choice", () => {
    expect(themeAttribute("system")).toBeUndefined();
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

    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

describe("the theme control", () => {
  it("offers the three choices as radios with the stored one selected", async () => {
    vi.doMock("../src/server/account/actions", () => ({
      setThemePreference: mocks.setThemePreference,
    }));
    const { ThemePanel } = await import("../src/components/settings/ThemePanel");

    render(<ThemePanel preference="dark" />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /Dark/ })).toHaveProperty("checked", true);
    expect(screen.getByRole("radio", { name: /System/ })).toHaveProperty("checked", false);
  });

  it("saves the choice that was picked", async () => {
    vi.doMock("../src/server/account/actions", () => ({
      setThemePreference: mocks.setThemePreference,
    }));
    const { ThemePanel } = await import("../src/components/settings/ThemePanel");

    render(<ThemePanel preference="system" />);
    fireEvent.click(screen.getByRole("radio", { name: /Light/ }));

    await waitFor(() => expect(mocks.setThemePreference).toHaveBeenCalledWith("light"));
  });
});
