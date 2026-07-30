import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemplateLivePreview } from "../src/components/templates/TemplateLivePreview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
});
