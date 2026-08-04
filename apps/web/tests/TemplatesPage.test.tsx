import { GardenPromiseRenderer, InvitationRenderer } from "@invitica/renderer";
import {
  resolveTemplateById,
  resolveTemplateVersion,
  templateCatalog,
} from "@invitica/template-kit";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TemplatesError from "../app/dashboard/templates/error";
import TemplatesLoading from "../app/dashboard/templates/loading";
import TemplatesPage from "../app/dashboard/templates/page";
import { TemplateCatalog } from "../src/components/templates/TemplateCatalog";
import { ensurePersonalWorkspace } from "../src/server/auth/session";
import { listInvitationDrafts } from "../src/server/invitations/drafts";

vi.mock("../src/server/auth/actions", () => ({
  signOut: vi.fn(),
}));

vi.mock("../src/server/auth/session", () => ({
  ensurePersonalWorkspace: vi.fn(),
}));

vi.mock("../src/server/invitations/drafts", () => ({
  listInvitationDrafts: vi.fn(),
}));

vi.mock("../src/server/invitations/actions", () => ({
  createInvitationDraftAction: vi.fn(async (state) => state),
}));

const creationRequestIds = {
  "garden-promise": "71000000-0000-4000-8000-000000000001",
  "golden-hour": "71000000-0000-4000-8000-000000000002",
  "sunday-joy": "71000000-0000-4000-8000-000000000003",
  "little-blessings": "71000000-0000-4000-8000-000000000004",
};

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(ensurePersonalWorkspace).mockReset();
  vi.mocked(listInvitationDrafts).mockReset();
  vi.mocked(listInvitationDrafts).mockResolvedValue([]);
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
      workspaceId: "72000000-0000-4000-8000-000000000001",
    });

    render(await TemplatesPage());

    expect(screen.getByRole("heading", { level: 1, name: "Templates" })).toBeDefined();
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });

  it("uses the distinct renderer-derived still for every template card", () => {
    render(<TemplateCatalog creationRequestIds={creationRequestIds} templates={templateCatalog} />);

    const sources = templateCatalog.map((template) => {
      const image = screen
        .getByRole("button", { name: `Quick preview ${template.name}` })
        .querySelector<HTMLImageElement>("img");

      expect(image?.getAttribute("alt")).toBe("");
      if (!image) throw new Error(`Missing still for ${template.id}`);

      return image.src.includes("/_next/image")
        ? new URL(image.src).searchParams.get("url")
        : image.getAttribute("src");
    });

    expect(sources).toEqual([
      "/landing/templates/garden-promise-svg-20260804.jpg",
      "/landing/templates/golden-hour-svg-20260804.jpg",
      "/landing/templates/sunday-joy-svg-20260804.jpg",
      "/landing/templates/little-blessings-svg-20260804.jpg",
    ]);
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
    render(<TemplateCatalog creationRequestIds={creationRequestIds} templates={templateCatalog} />);

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

  it("opens the mobile filter sheet, applies a filter, and restores focus", () => {
    render(<TemplateCatalog creationRequestIds={creationRequestIds} templates={templateCatalog} />);

    const trigger = screen.getByRole("button", { name: "Filters" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Filter templates" });
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Close template filters" }),
    );
    const occasionSelect = within(dialog).getByRole("combobox", { name: "Occasion" });
    fireEvent.click(occasionSelect);
    expect(screen.getByRole("listbox", { name: "Occasion" })).toBeDefined();
    fireEvent.keyDown(occasionSelect, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Occasion" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Filter templates" })).toBeDefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Premium" }));
    expect(screen.getByRole("button", { name: /Tier: Premium/ })).toBeDefined();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Filter templates" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("enables creation for every production template with stable request keys", () => {
    render(<TemplateCatalog creationRequestIds={creationRequestIds} templates={templateCatalog} />);

    const creationButtons = screen.getAllByRole("button", { name: "Use this template" });
    const previewOnlyButtons = screen.queryAllByRole("button", { name: "Preview only" });

    expect(creationButtons).toHaveLength(4);
    expect(previewOnlyButtons).toHaveLength(0);
    expect(
      creationButtons.map(
        (button) =>
          (button as HTMLButtonElement).form?.querySelector<HTMLInputElement>(
            'input[name="invitationId"]',
          )?.value,
      ),
    ).toEqual([
      creationRequestIds["garden-promise"],
      creationRequestIds["golden-hour"],
      creationRequestIds["sunday-joy"],
      creationRequestIds["little-blessings"],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Quick preview Golden Hour" }));
    expect(screen.getByText("Production renderer")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Use this template" }).at(-1)).toBeDefined();
  });

  it("asks before reusing a template and offers the existing invitation library", () => {
    render(
      <TemplateCatalog
        creationRequestIds={creationRequestIds}
        templates={templateCatalog}
        usedTemplateVersionIds={[resolveTemplateById("garden-promise").templateVersionId]}
      />,
    );

    const reuseButton = screen
      .getAllByRole("button", { name: "Use this template" })
      .find((button) => !button.hasAttribute("disabled"));

    if (!reuseButton) {
      throw new Error("Expected the production template action to be enabled.");
    }

    fireEvent.click(reuseButton);

    expect(
      screen.getByText(
        "You have already started an invitation with Garden Promise. Create another one for a different event?",
      ),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Create another" })).toBeDefined();
    expect(screen.getByRole("link", { name: "View invitations" }).getAttribute("href")).toBe(
      "/dashboard/invitations",
    );

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("button", { name: "Create another" })).toBeNull();
    expect(document.activeElement).toBe(reuseButton);
  });

  it("opens and closes an accessible responsive preview", () => {
    const { container } = render(
      <TemplateCatalog creationRequestIds={creationRequestIds} templates={templateCatalog} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Quick preview Garden Promise" }));
    expect(screen.getByRole("dialog", { name: "Preview Garden Promise" })).toBeDefined();
    expect(screen.getByText("Production renderer")).toBeDefined();
    expect(screen.getByRole("button", { name: /Open invitation for/ })).toBeDefined();
    expect(screen.queryByRole("heading", { level: 1, name: "Mara & Joaquin" })).toBeNull();
    expect(container.querySelector('[data-envelope-gated="true"]')?.hasAttribute("inert")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Replay opening" }).hasAttribute("disabled")).toBe(
      true,
    );
    const fullPreviewLink = screen.getByRole("link", {
      name: "Open Garden Promise full invitation in a new tab",
    });
    expect(fullPreviewLink.getAttribute("href")).toBe("/templates/garden-promise/preview");
    expect(fullPreviewLink.getAttribute("target")).toBe("_blank");
    expect(fullPreviewLink.getAttribute("rel")).toBe("noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "Desktop preview" }));
    expect(screen.getByTestId("template-preview-stage").getAttribute("data-device")).toBe(
      "desktop",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close template preview" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /**
   * The quick preview and the full preview route must show a creator the same template. Both assert
   * against the showcase document rather than a copied list, so the two cannot drift apart — the
   * matching assertion lives in `TemplateLivePreview.test.tsx`.
   */
  it("previews every Garden Promise section and image slot, like the full route", () => {
    const { container } = render(
      <TemplateCatalog creationRequestIds={creationRequestIds} templates={templateCatalog} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Quick preview Garden Promise" }));

    // Scoped to the preview stage: the catalog cards also carry `data-template`.
    const invitation = container.querySelector('[data-testid="template-preview-stage"]');
    if (!invitation) throw new Error("Expected the Garden Promise renderer in the modal");

    const showcase = resolveTemplateById("garden-promise").defaultDocument;
    expect(
      [...invitation.querySelectorAll("[data-section-type]")].map((section) =>
        section.getAttribute("data-section-type"),
      ),
    ).toEqual(showcase.sections.map((section) => section.type));

    expect(invitation.querySelectorAll(".ot-media-placeholder")).toHaveLength(8);
    expect(invitation.querySelectorAll(".ot-hero-placeholder")).toHaveLength(1);
  });

  it.each([
    ["golden-hour", "Golden Hour", 7],
    ["sunday-joy", "Sunday Joy", 8],
  ])("previews every %s section and image slot, like the full route", (templateId, templateName, placeholders) => {
    const { container } = render(
      <TemplateCatalog creationRequestIds={creationRequestIds} templates={templateCatalog} />,
    );

    fireEvent.click(screen.getByRole("button", { name: `Quick preview ${templateName}` }));

    const invitation = container.querySelector('[data-testid="template-preview-stage"]');
    if (!invitation) throw new Error(`Expected the ${templateId} renderer in the modal`);

    const showcase = resolveTemplateById(templateId).defaultDocument;
    expect(
      [...invitation.querySelectorAll("[data-section-type]")].map((section) =>
        section.getAttribute("data-section-type"),
      ),
    ).toEqual(showcase.sections.map((section) => section.type));

    expect(invitation.querySelectorAll(".ot-media-placeholder")).toHaveLength(placeholders);
    expect(invitation.querySelectorAll(".ot-hero-placeholder")).toHaveLength(1);
  });

  it("handles no matches, loading, and unexpected errors", () => {
    const { unmount } = render(
      <TemplateCatalog creationRequestIds={creationRequestIds} templates={templateCatalog} />,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search templates" }), {
      target: { value: "not a real template" },
    });
    expect(screen.getByRole("heading", { name: "No templates match your search." })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
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

describe("standard template cinematic takeover", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hands Golden Hour and Sunday Joy directly from the opener into their real hero", () => {
    vi.useFakeTimers();

    for (const templateId of ["golden-hour", "sunday-joy"]) {
      const manifest = resolveTemplateById(templateId);
      const { container, unmount } = render(
        <InvitationRenderer document={manifest.defaultDocument} mode="preview" />,
      );
      const invitation = container.querySelector("[data-opening-state]");
      const content = container.querySelector<HTMLElement>("[data-envelope-gated]");
      const opening = container.querySelector("[data-envelope-opening]");

      fireEvent.click(screen.getByRole("button", { name: /Open invitation for/ }));
      act(() => vi.advanceTimersByTime(620));
      act(() => vi.advanceTimersByTime(700));

      expect(invitation?.getAttribute("data-opening-state")).toBe("letter-revealing");
      expect(content?.getAttribute("data-envelope-visual-gated")).toBe("false");
      expect(content?.hasAttribute("inert")).toBe(true);

      act(() => vi.advanceTimersByTime(760));
      act(() => vi.advanceTimersByTime(0));

      expect(invitation?.getAttribute("data-opening-state")).toBe("opened");
      expect(opening?.hasAttribute("hidden")).toBe(true);
      expect(content?.hasAttribute("inert")).toBe(false);
      unmount();
    }
  });
});

describe("Garden Promise invitation interaction", () => {
  const gardenPromise = resolveTemplateVersion("40000000-0000-4000-8000-000000000001");

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves through the explicit opening states, gates content, and ignores repeated input", () => {
    vi.useFakeTimers();
    const { container } = render(
      <GardenPromiseRenderer document={gardenPromise.defaultDocument} mode="preview" />,
    );
    const invitation = container.querySelector("[data-opening-state]");
    const content = container.querySelector<HTMLElement>("[data-envelope-gated]");
    const opener = screen.getByRole("button", { name: /Open invitation for/ });

    expect(invitation?.getAttribute("data-opening-state")).toBe("closed");
    expect(content?.getAttribute("data-envelope-gated")).toBe("true");
    expect(content?.hasAttribute("inert")).toBe(true);
    fireEvent.click(opener);
    expect(invitation?.getAttribute("data-opening-state")).toBe("untying");
    fireEvent.click(opener);
    expect(invitation?.getAttribute("data-opening-state")).toBe("untying");

    expect(screen.getByRole("button", { name: "Skip opening" })).toBeDefined();
    act(() => vi.advanceTimersByTime(900));
    expect(invitation?.getAttribute("data-opening-state")).toBe("opening");
    act(() => vi.advanceTimersByTime(1_050));
    expect(invitation?.getAttribute("data-opening-state")).toBe("letter-revealing");
    expect(content?.getAttribute("data-envelope-visual-gated")).toBe("false");
    act(() => vi.advanceTimersByTime(1_400));
    act(() => vi.advanceTimersByTime(0));
    expect(invitation?.getAttribute("data-opening-state")).toBe("opened");
    expect(content?.getAttribute("data-envelope-gated")).toBe("false");
    expect(content?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(content?.querySelector("main"));
    expect(container.querySelector("[data-envelope-opening]")?.hasAttribute("hidden")).toBe(true);
    expect(screen.queryByRole("button", { name: /Invitation for .* opened/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip opening" })).toBeNull();
  });

  it("lets a guest skip the extended Garden Promise opening", () => {
    const { container } = render(
      <GardenPromiseRenderer document={gardenPromise.defaultDocument} mode="preview" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open invitation for/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skip opening" }));

    expect(
      container.querySelector("[data-opening-state]")?.getAttribute("data-opening-state"),
    ).toBe("opened");
    expect(container.querySelector("[data-envelope-gated]")?.hasAttribute("inert")).toBe(false);
    expect(screen.queryByRole("button", { name: "Skip opening" })).toBeNull();
  });

  it("keeps creator preview gating scoped and restores a published lock on unmount", () => {
    const preview = render(
      <GardenPromiseRenderer document={gardenPromise.defaultDocument} mode="preview" />,
    );
    expect(document.documentElement.hasAttribute("data-invitation-scroll-lock")).toBe(false);
    preview.unmount();

    const published = render(
      <GardenPromiseRenderer document={gardenPromise.defaultDocument} mode="published" />,
    );
    expect(document.documentElement.getAttribute("data-invitation-scroll-lock")).toBe("true");
    published.unmount();
    expect(document.documentElement.hasAttribute("data-invitation-scroll-lock")).toBe(false);
    expect(document.body.style.position).toBe("");
  });

  it("locks scrolling only for the hydrated published invitation and restores it", () => {
    vi.useFakeTimers();
    const { container, unmount } = render(
      <GardenPromiseRenderer document={gardenPromise.defaultDocument} mode="published" />,
    );

    expect(document.documentElement.getAttribute("data-invitation-scroll-lock")).toBe("true");
    expect(document.body.style.position).toBe("fixed");
    fireEvent.click(screen.getByRole("button", { name: /Open invitation for/ }));
    act(() => vi.advanceTimersByTime(900));
    act(() => vi.advanceTimersByTime(1_050));
    act(() => vi.advanceTimersByTime(1_400));
    act(() => vi.advanceTimersByTime(0));

    expect(
      container.querySelector("[data-opening-state]")?.getAttribute("data-opening-state"),
    ).toBe("opened");
    expect(document.documentElement.hasAttribute("data-invitation-scroll-lock")).toBe(false);
    expect(document.body.style.position).toBe("");
    unmount();
    expect(document.documentElement.hasAttribute("data-invitation-scroll-lock")).toBe(false);
  });

  it("opens immediately with reduced motion while keeping the invitation readable", () => {
    const { container } = render(
      <GardenPromiseRenderer
        document={gardenPromise.defaultDocument}
        mode="preview"
        recipientName="The Villanueva and de la Cruz Family"
        reducedMotion
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open invitation for/ }));

    expect(
      container.querySelector("[data-opening-state]")?.getAttribute("data-opening-state"),
    ).toBe("opened");
    expect(screen.getAllByText("The Villanueva and de la Cruz Family").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1, name: "Mara & Joaquin" })).toBeDefined();
    expect(screen.getByText("Hiraya Garden Pavilion")).toBeDefined();
  });
});
