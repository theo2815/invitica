import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TemplatesError from "../app/dashboard/templates/error";
import TemplatesLoading from "../app/dashboard/templates/loading";
import TemplatesPage from "../app/dashboard/templates/page";
import { TemplateCatalog } from "../src/components/templates/TemplateCatalog";
import { ensurePersonalWorkspace } from "../src/server/auth/session";

vi.mock("../src/server/auth/actions", () => ({
  signOut: vi.fn(),
}));

vi.mock("../src/server/auth/session", () => ({
  ensurePersonalWorkspace: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(ensurePersonalWorkspace).mockReset();
});

describe("templates page", () => {
  it("renders the protected creator preview collection", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: null,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: "workspace-id",
    });

    render(await TemplatesPage());

    expect(screen.getByRole("heading", { level: 1, name: "Templates" })).toBeDefined();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: "Templates" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Templates" })[0]?.getAttribute("href")).toBe(
      "/dashboard/templates",
    );
    expect(screen.getByText("maria@example.com")).toBeDefined();
  });

  it("shows the workspace failure instead of a template collection", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: { message: "Migration missing" } as never,
      supabase: {} as never,
      user: {
        email: "maria@example.com",
        user_metadata: { full_name: "Maria Santos" },
      } as never,
      workspaceId: null,
    });

    render(await TemplatesPage());

    expect(screen.getByRole("alert").textContent).toContain("Your workspace needs attention");
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("searches and filters the preview collection", () => {
    render(<TemplateCatalog />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search templates" }), {
      target: { value: "debut" },
    });
    expect(screen.getByRole("heading", { level: 2, name: "Golden Hour" })).toBeDefined();
    expect(screen.queryByRole("heading", { level: 2, name: "Garden Promise" })).toBeNull();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search templates" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Premium" }));
    expect(screen.getByRole("heading", { level: 2, name: "Golden Hour" })).toBeDefined();
    expect(screen.queryByRole("heading", { level: 2, name: "Sunday Joy" })).toBeNull();
  });

  it("opens and closes an accessible responsive preview", () => {
    render(<TemplateCatalog />);

    fireEvent.click(screen.getByRole("button", { name: "Preview Garden Promise" }));
    expect(screen.getByRole("dialog", { name: "Preview Garden Promise" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Desktop preview" }));
    expect(screen.getByTestId("template-preview-stage").getAttribute("data-device")).toBe(
      "desktop",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close template preview" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("handles no matches, loading, and unexpected errors", () => {
    const { unmount } = render(<TemplateCatalog />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search templates" }), {
      target: { value: "not a real template" },
    });
    expect(screen.getByRole("heading", { name: "No templates match your search." })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    unmount();

    const loading = render(<TemplatesLoading />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Loading templates");
    loading.unmount();

    const reset = vi.fn();
    render(<TemplatesError error={new Error("Unavailable")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("alert").textContent).toContain("Templates could not be loaded");
    expect(reset).toHaveBeenCalledOnce();
  });
});
