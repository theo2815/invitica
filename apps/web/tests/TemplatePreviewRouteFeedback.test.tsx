import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TemplatePreviewError from "../app/templates/[templateId]/preview/error";
import TemplatePreviewLoading from "../app/templates/[templateId]/preview/loading";

afterEach(() => cleanup());

describe("template preview route feedback", () => {
  it("keeps a stable, descriptive shell while the full preview loads", () => {
    render(<TemplatePreviewLoading />);

    expect(screen.getByRole("status").getAttribute("aria-atomic")).toBe("true");
    expect(screen.getByRole("heading", { name: "Preparing the invitation…" })).toBeDefined();
    expect(screen.getByText(/full template will appear here/)).toBeDefined();
  });

  it("offers retry and a safe route back when preview rendering fails", () => {
    const reset = vi.fn();
    render(<TemplatePreviewError reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));

    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Back to templates" }).getAttribute("href")).toBe(
      "/#templates",
    );
  });
});
