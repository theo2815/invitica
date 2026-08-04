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

  it("makes real invitation previews the page's primary conversion", () => {
    render(createElement(LandingConcept, { templates: templateCatalog }));

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "An invitation they will remember opening.",
      }),
    ).toBeDefined();
    expect(
      screen
        .getAllByRole("link", { name: "Preview a real invitation" })
        .every(
          (link) =>
            link.getAttribute("href") === "/templates/little-blessings/preview" &&
            link.getAttribute("target") === "_blank" &&
            link.getAttribute("rel") === "noreferrer",
        ),
    ).toBe(true);
    expect(screen.queryByRole("link", { name: "Pricing" })).toBeNull();
    expect(screen.queryByText(/purchase one premium publication/i)).toBeNull();
  });

  it("uses renderer-derived stills and sends every card to its full preview", () => {
    const { container } = render(createElement(LandingConcept, { templates: templateCatalog }));

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
      Array.from(container.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')).map(
        (image) =>
          image.src.includes("/_next/image")
            ? new URL(image.src).searchParams.get("url")
            : image.getAttribute("src"),
      ),
    ).toEqual([
      "/landing/templates/garden-promise-svg-20260804.jpg",
      "/landing/templates/golden-hour-svg-20260804.jpg",
      "/landing/templates/sunday-joy-svg-20260804.jpg",
      "/landing/templates/little-blessings-svg-20260804.jpg",
    ]);
    expect(container.querySelector("[data-index]")).toBeNull();
  });

  it("opens, follows, and closes the mobile navigation", () => {
    render(createElement(LandingConcept, { templates: templateCatalog }));

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")).toBe(
      "true",
    );

    fireEvent.click(
      screen.getByRole("navigation", { name: "Mobile navigation" }).querySelector("a") as Element,
    );
    expect(screen.getByRole("button", { name: "Open menu" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });
});
