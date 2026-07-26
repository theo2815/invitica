import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BrandMark } from "../src/components/BrandMark";

afterEach(() => {
  cleanup();
});

describe("BrandMark", () => {
  it("renders the folded-I symbol with its wordmark", () => {
    const { container } = render(<BrandMark />);
    const brand = screen.getByRole("img", { name: "Invitica" });

    expect(brand.textContent).toContain("Invitica");
    expect(container.querySelector('svg[viewBox="0 0 24 32"]')).not.toBeNull();
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("keeps the compact symbol accessible without rendering wordmark text", () => {
    const { container } = render(<BrandMark compact />);
    const brand = screen.getByRole("img", { name: "Invitica" });

    expect(brand.textContent).toBe("");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
