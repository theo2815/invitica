import { templateCatalog } from "@invitica/template-kit";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingConcept } from "../src/components/LandingConcept";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Invitica marketing landing interactions", () => {
  it("links desktop and mobile visitors to authentication", () => {
    render(createElement(LandingConcept, { templates: templateCatalog }));

    expect(
      screen
        .getAllByRole("link", { name: "Log in" })
        .every((link) => link.getAttribute("href") === "/login"),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: "Create account" })
        .every((link) => link.getAttribute("href") === "/register"),
    ).toBe(true);
  });

  it("opens and replays the invitation sample through the shared lifecycle", () => {
    vi.useFakeTimers();
    render(createElement(LandingConcept, { templates: templateCatalog }));

    fireEvent.click(screen.getByRole("button", { name: /Open invitation for/ }));
    act(() => vi.advanceTimersByTime(900));
    act(() => vi.advanceTimersByTime(1_050));
    act(() => vi.advanceTimersByTime(1_400));
    act(() => vi.advanceTimersByTime(0));

    expect(screen.getByText("Sample invitation opened")).toBeDefined();
    const replay = screen.getByRole("button", { name: "Replay opening" });
    expect(replay.hasAttribute("disabled")).toBe(false);
    fireEvent.click(replay);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole("button", { name: /Open invitation for/ })).toBeDefined();
  });

  it("opens and closes the mobile navigation", () => {
    render(createElement(LandingConcept, { templates: templateCatalog }));

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")).toBe(
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.getByRole("button", { name: "Open menu" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("loads a selected template into the invitation preview", () => {
    render(createElement(LandingConcept, { templates: templateCatalog }));

    const previewButton = screen.getAllByRole("button", { name: "Preview" })[0];
    if (!previewButton) {
      throw new Error("Expected a template preview button");
    }
    fireEvent.click(previewButton);

    expect(screen.getAllByText("Sam turns XVIII").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Selected" })).toHaveLength(1);
  });
});
