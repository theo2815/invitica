import { resolveTemplateById } from "@invitica/template-kit";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemplateLivePreview } from "../src/components/templates/TemplateLivePreview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("full template preview", () => {
  it("reveals the unauthenticated Garden Promise action only after the guest opening", () => {
    vi.useFakeTimers();
    render(
      <TemplateLivePreview
        authenticated={false}
        creationRequestId="71000000-0000-4000-8000-000000000001"
        returningFromLogin={false}
        templateId="garden-promise"
        usedBefore={false}
      />,
    );

    expect(screen.queryByRole("link", { name: "Log in to use this template" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Open invitation for/ }));
    act(() => vi.advanceTimersByTime(900));
    act(() => vi.advanceTimersByTime(1_050));
    act(() => vi.advanceTimersByTime(1_400));
    act(() => vi.advanceTimersByTime(0));

    expect(
      within(screen.getByRole("complementary", { name: "Template preview actions" })).getByText(
        "Garden Promise",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Log in to use this template" }).getAttribute("href"),
    ).toBe("/login?next=%2Ftemplates%2Fgarden-promise%2Fpreview%3Fintent%3Duse");
    expect(document.documentElement.hasAttribute("data-invitation-scroll-lock")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Hide template actions" }));
    expect(screen.queryByRole("link", { name: "Log in to use this template" })).toBeNull();
    const restoreAction = screen.getByRole("button", { name: "Show template actions" });
    expect(restoreAction.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(restoreAction);

    fireEvent.click(restoreAction);
    expect(screen.getByRole("link", { name: "Log in to use this template" })).toBeDefined();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Hide template actions" }),
    );
  });

  it("offers the upgraded Golden Hour template for creation", () => {
    vi.useFakeTimers();
    render(
      <TemplateLivePreview
        authenticated={false}
        creationRequestId="71000000-0000-4000-8000-000000000002"
        returningFromLogin={false}
        templateId="golden-hour"
        usedBefore={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open invitation for/ }));
    act(() => vi.advanceTimersByTime(620));
    act(() => vi.advanceTimersByTime(700));
    act(() => vi.advanceTimersByTime(760));
    act(() => vi.advanceTimersByTime(0));

    expect(
      within(screen.getByRole("complementary", { name: "Template preview actions" })).getByText(
        "Golden Hour",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Log in to use this template" }).getAttribute("href"),
    ).toBe("/login?next=%2Ftemplates%2Fgolden-hour%2Fpreview%3Fintent%3Duse");
  });

  it("reuses the friendly repeat-template decision for authenticated creators", () => {
    vi.useFakeTimers();
    render(
      <TemplateLivePreview
        authenticated
        creationRequestId="71000000-0000-4000-8000-000000000001"
        returningFromLogin
        templateId="garden-promise"
        usedBefore
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open invitation for/ }));
    act(() => vi.advanceTimersByTime(620));
    act(() => vi.advanceTimersByTime(700));
    act(() => vi.advanceTimersByTime(760));
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole("status").textContent).toContain("You’re signed in");

    fireEvent.click(screen.getByRole("button", { name: "Use this template" }));
    expect(screen.getByRole("button", { name: "Create another" })).toBeDefined();
    expect(screen.getByRole("link", { name: "View invitations" }).getAttribute("href")).toBe(
      "/dashboard/invitations",
    );
  });

  /**
   * The catalog preview is where a creator decides. It renders the showcase document, so every
   * section the document carries is present — including the album and gift list a new draft ships
   * hidden — and the album shows the renderer's upload placeholder rather than photographs belonging
   * to the sample wedding.
   *
   * It renders in preview mode, identical to the quick-preview modal, so a creator sees the same
   * eleven sections either way — including the reply section, which published mode would omit.
   */
  it("shows every Garden Promise section, its album placeholders, and both venue maps", () => {
    // The click-to-load map needs a configured tile key; without one the renderer falls back to the
    // "Get directions" link, so the coordinates alone are not enough to prove the control appears.
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "template-preview-test-key");
    render(
      <TemplateLivePreview
        authenticated={false}
        creationRequestId="71000000-0000-4000-8000-000000000001"
        returningFromLogin={false}
        templateId="garden-promise"
        usedBefore={false}
      />,
    );

    const invitation = document.querySelector('[data-template="garden-promise"]');
    if (!invitation) throw new Error("Expected the Garden Promise renderer");

    // Asserted against the showcase itself rather than a copied list, so this stays true as the
    // template changes and states the actual property: the preview shows the whole document.
    const showcase = resolveTemplateById("garden-promise").defaultDocument;
    expect(
      [...invitation.querySelectorAll("[data-section-type]")].map((section) =>
        section.getAttribute("data-section-type"),
      ),
    ).toEqual(showcase.sections.map((section) => section.type));
    expect(invitation.querySelector('[data-section-type="rsvp"]')).not.toBeNull();

    // One placeholder for every image slot the template offers: the couple's portrait, four album
    // frames, and a picture for each gift idea.
    expect(invitation.querySelectorAll(".ot-media-placeholder")).toHaveLength(8);
    expect(invitation.querySelectorAll(".ot-hero-placeholder")).toHaveLength(1);
    expect(screen.getByText("Our story in photographs")).toBeDefined();
    expect(screen.getByText("A note about gifts")).toBeDefined();

    // Both venues carry coordinates, so the click-to-load map control appears once hydrated.
    // Queried through the DOM rather than by role: the invitation body is inert until a guest opens
    // the envelope, which keeps it out of the accessibility tree that `getAllByRole` searches.
    const mapToggles = [...invitation.querySelectorAll(".im-toggle")];
    expect(mapToggles).toHaveLength(2);
    expect(mapToggles.every((toggle) => toggle.textContent === "Show map")).toBe(true);
    // The directions link stays alongside the map rather than being replaced by it.
    expect(invitation.querySelectorAll('a[href="https://maps.google.com/"]')).toHaveLength(2);
  });
});
