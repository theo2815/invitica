import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PrivacyPage from "../app/privacy/page";
import TermsPage from "../app/terms/page";
import { formatEffectiveDate } from "../src/components/legal/LegalDocumentPage";

afterEach(cleanup);

describe("Invitica legal documents", () => {
  it("presents the Terms as effective, with no draft or activation-blocker language left", () => {
    render(<TermsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeDefined();
    expect(screen.getByText("In effect since 8 August 2026")).toBeDefined();
    expect(screen.getByText("Version 1.0")).toBeDefined();
    expect(screen.queryByText(/Working draft/)).toBeNull();
    expect(screen.queryByText(/Activation is blocked/)).toBeNull();
    expect(screen.queryByText(/Review blocker/)).toBeNull();
    expect(screen.getAllByRole("link", { name: "Privacy Notice" })[0]?.getAttribute("href")).toBe(
      "/privacy",
    );
  });

  it("names the operator, the address, and the one contact channel in the Terms", () => {
    render(<TermsPage />);

    expect(screen.getByText(/operated by Theo Cedric Chan, an individual based/)).toBeDefined();
    expect(screen.getAllByText(/Tuyan, Naga City, Cebu, Philippines/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/invitica\.support@gmail\.com/).length).toBeGreaterThan(0);
  });

  it("states the eligibility, liability, and venue positions the founder chose", () => {
    render(<TermsPage />);

    expect(screen.getByText(/at least 18 years old/)).toBeDefined();
    expect(screen.getByText(/greater of the amounts you paid us in the 12 months/)).toBeDefined();
    expect(screen.getByText(/PHP 5,000/)).toBeDefined();
    expect(screen.getByText(/competent courts of Cebu City/)).toBeDefined();
  });

  it("tells creators that Invi proposes and never saves, and that fees are not payable yet", () => {
    render(<TermsPage />);

    expect(screen.getByText(/Invi proposes; it never saves/)).toBeDefined();
    expect(screen.getByText(/Invitica charges nothing today/)).toBeDefined();
    expect(screen.getByText(/not refundable once the invitation has been published/)).toBeDefined();
  });

  it("presents the Privacy Notice as effective and identifies the accountable person", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Notice" })).toBeDefined();
    expect(screen.getByText("In effect since 8 August 2026")).toBeDefined();
    expect(screen.queryByText(/Working draft/)).toBeNull();
    expect(screen.getByText(/Accountable person for privacy: Theo Cedric Chan/)).toBeDefined();
    expect(screen.getAllByRole("link", { name: "Terms of Service" })[0]?.getAttribute("href")).toBe(
      "/terms",
    );
  });

  it("publishes a lawful-basis table and a retention table", () => {
    render(<PrivacyPage />);

    const lawfulBasis = screen.getByRole("table", {
      name: "5. Why the information is used, and on what basis",
    });
    expect(within(lawfulBasis).getByRole("columnheader", { name: "Lawful basis" })).toBeDefined();
    expect(
      within(lawfulBasis).getByRole("rowheader", {
        name: /Record which document versions you accepted/,
      }),
    ).toBeDefined();

    const retention = screen.getByRole("table", { name: "13. How long information is kept" });
    expect(within(retention).getByRole("rowheader", { name: "Invi conversations" })).toBeDefined();
    expect(within(retention).getByText(/Nothing expires them automatically/)).toBeDefined();
  });

  it("puts every table in a focusable named region so a keyboard reader can scroll it", () => {
    render(<PrivacyPage />);

    const tables = screen.getAllByRole("table");
    expect(tables.length).toBe(4);

    for (const table of tables) {
      const scroller = table.parentElement;
      expect(scroller?.tagName).toBe("SECTION");
      expect(scroller?.getAttribute("tabindex")).toBe("0");
      expect(scroller?.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("names every processor that touches personal information, including the ones added after the draft", () => {
    render(<PrivacyPage />);

    const providers = screen.getByRole("table", {
      name: "9. Providers and processing outside the Philippines",
    });
    for (const provider of [
      "Supabase",
      "Cloudflare",
      "Vercel",
      "Trigger.dev",
      "MapTiler",
      "Google",
      "Anthropic",
      "Resend",
    ]) {
      expect(within(providers).getByRole("rowheader", { name: provider })).toBeDefined();
    }
  });

  it("states the AI, rights, breach, and children commitments", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/paid one with model training on our data switched off/)).toBeDefined();
    expect(screen.getByText(/respond within 15 working days/)).toBeDefined();
    expect(screen.getByText(/within 72 hours of learning about it/)).toBeDefined();
    expect(screen.getByText(/must be 18 or older to hold an Invitica account/)).toBeDefined();
    expect(screen.getByText(/does not use your content, your guests' information/)).toBeDefined();
  });
});

describe("formatEffectiveDate", () => {
  it("formats a stored ISO date without depending on the host locale", () => {
    expect(formatEffectiveDate("2026-08-08")).toBe("8 August 2026");
    expect(formatEffectiveDate("2026-12-25")).toBe("25 December 2026");
  });

  it("returns the raw value rather than inventing a date it cannot parse", () => {
    expect(formatEffectiveDate("not-a-date")).toBe("not-a-date");
  });
});
