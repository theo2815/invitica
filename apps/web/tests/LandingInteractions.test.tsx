import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { LandingConcept } from "../src/components/LandingConcept";

afterEach(cleanup);

describe("Invitica marketing landing interactions", () => {
  it("opens the invitation sample", () => {
    render(createElement(LandingConcept));

    fireEvent.click(screen.getByRole("button", { name: "Open sample invitation" }));

    expect(
      screen.getByRole("button", { name: "Close sample invitation" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByText(/Invitation opened/)).toBeDefined();
  });

  it("opens and closes the mobile navigation", () => {
    render(createElement(LandingConcept));

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
    render(createElement(LandingConcept));

    const previewButton = screen.getAllByRole("button", { name: "Preview" })[0];
    if (!previewButton) {
      throw new Error("Expected a template preview button");
    }
    fireEvent.click(previewButton);

    expect(screen.getAllByText("Sam turns XVIII").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Selected" })).toHaveLength(1);
  });
});
