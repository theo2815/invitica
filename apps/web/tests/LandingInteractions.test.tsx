import { templateCatalog } from "@invitica/template-kit";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { LandingConcept } from "../src/components/LandingConcept";

afterEach(() => {
  cleanup();
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

  it("replaces account creation with sign-in while the production beta lock is on", () => {
    render(createElement(LandingConcept, { betaLocked: true, templates: templateCatalog }));

    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: "Log in" })
        .every((link) => link.getAttribute("href") === "/login"),
    ).toBe(true);
  });

  it("replaces authentication actions with Home for signed-in visitors", () => {
    render(createElement(LandingConcept, { authenticated: true, templates: templateCatalog }));

    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: "Home" })
        .every((link) => link.getAttribute("href") === "/dashboard"),
    ).toBe(true);
  });

  it("keeps the hero focused and sends each template to its full preview", () => {
    render(createElement(LandingConcept, { templates: templateCatalog }));

    expect(screen.queryByRole("button", { name: /Open invitation for/ })).toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Make your invitation feel as special as the event.",
      }),
    ).toBeDefined();
    expect(
      screen
        .getAllByRole("link", { name: /preview invitation \(opens in a new tab\)/i })
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/templates/garden-promise/preview",
      "/templates/golden-hour/preview",
      "/templates/sunday-joy/preview",
      "/templates/little-blessings/preview",
    ]);
    expect(
      screen
        .getAllByRole("link", { name: /preview invitation \(opens in a new tab\)/i })
        .every(
          (link) =>
            link.getAttribute("target") === "_blank" && link.getAttribute("rel") === "noreferrer",
        ),
    ).toBe(true);
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
});
