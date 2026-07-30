import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BrandMark } from "../src/components/BrandMark";

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

  it("keeps the compact symbol accessible without rendering the wordmark asset", () => {
    const { container } = render(<BrandMark compact />);
    const brand = screen.getByRole("img", { name: "Invitica" });

    expect(brand.textContent).toBe("");
    expect(container.querySelector('svg[viewBox="0 0 24 32"]')).not.toBeNull();
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
  });
});
