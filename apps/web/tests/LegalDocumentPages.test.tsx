import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PrivacyPage from "../app/privacy/page";
import TermsPage from "../app/terms/page";

afterEach(cleanup);

describe("Invitica legal working drafts", () => {
  it("keeps the Terms draft visibly non-effective and lists activation blockers", () => {
    render(<TermsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeDefined();
    expect(screen.getByText("Working draft · Not in effect")).toBeDefined();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Founder and legal review still required",
      }),
    ).toBeDefined();
    expect(screen.getByText(/Warranty disclaimers, limitation of liability/)).toBeDefined();
    expect(screen.getAllByRole("link", { name: "Privacy Notice" })[0]?.getAttribute("href")).toBe(
      "/privacy",
    );
  });

  it("describes current Google and guest-data boundaries without claiming compliance", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Notice" })).toBeDefined();
    expect(screen.getByText("Working draft · Not in effect")).toBeDefined();
    expect(screen.getByText(/does not currently request Google Drive/)).toBeDefined();
    expect(
      screen.getByText(/creator may provide another person's name or photograph/),
    ).toBeDefined();
    expect(screen.getByText(/does not yet have a fully implemented/)).toBeDefined();
    expect(screen.getAllByRole("link", { name: "Terms of Service" })[0]?.getAttribute("href")).toBe(
      "/terms",
    );
  });
});
