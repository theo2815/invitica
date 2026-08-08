import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BrandMark } from "../src/components/BrandMark";
import { ThemeProvider } from "../src/components/ThemeContext";

afterEach(() => {
  cleanup();
});

describe("BrandMark", () => {
  it("renders the integrated wordmark asset", () => {
    const { container } = render(<BrandMark />);
    const brand = screen.getByRole("img", { name: "Invitica" });
    const wordmark = container.querySelector("img");

    expect(brand.textContent).toBe("");
    expect(wordmark?.getAttribute("src")).toContain("url=%2Fbrand%2Finvitica-wordmark-v2.png");
    expect(wordmark?.getAttribute("width")).toBe("1877");
    expect(wordmark?.getAttribute("height")).toBe("481");
    expect(wordmark?.getAttribute("loading")).toBe("eager");
    expect(wordmark?.getAttribute("sizes")).toBe("120px");
    expect(container.querySelector("svg")).toBeNull();
  });

  /**
   * The ink is baked into the raster, so the dark theme has to reach a different file. Everything
   * else about the lockup — the geometry, the eager load, the 120px hint, the accessible name —
   * is asserted to be identical, because only the ink changes.
   */
  it("reaches the dark file when the theme is dark, and no other attribute moves", () => {
    const { container } = render(
      <ThemeProvider theme="dark">
        <BrandMark />
      </ThemeProvider>,
    );
    const wordmark = container.querySelector("img");

    expect(screen.getByRole("img", { name: "Invitica" }).textContent).toBe("");
    expect(wordmark?.getAttribute("src")).toContain("url=%2Fbrand%2Finvitica-wordmark-v2-dark.png");
    expect(wordmark?.getAttribute("width")).toBe("1877");
    expect(wordmark?.getAttribute("height")).toBe("481");
    expect(wordmark?.getAttribute("loading")).toBe("eager");
    expect(wordmark?.getAttribute("sizes")).toBe("120px");
  });

  it("keeps the light file when the theme is explicitly light", () => {
    const { container } = render(
      <ThemeProvider theme="light">
        <BrandMark />
      </ThemeProvider>,
    );

    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "url=%2Fbrand%2Finvitica-wordmark-v2.png",
    );
  });

  it("keeps the compact symbol accessible without rendering the wordmark asset", () => {
    const { container } = render(<BrandMark compact />);
    const brand = screen.getByRole("img", { name: "Invitica" });

    expect(brand.textContent).toBe("");
    expect(container.querySelector('svg[viewBox="0 0 24 32"]')).not.toBeNull();
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
  });
});
