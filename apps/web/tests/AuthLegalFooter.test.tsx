import { LEGAL_DOCUMENTS } from "@invitica/renderer/legal-documents";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthPage, CheckEmailPage } from "../src/components/auth/AuthPage";
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyRecoveryPage,
} from "../src/components/auth/PasswordRecoveryPage";

const action = vi.fn(async () => ({ error: null }));
const googleAction = vi.fn(async () => {});

afterEach(cleanup);

function legalLinks() {
  return {
    privacy: screen.getAllByRole("link", { name: /Privacy Notice/ }),
    terms: screen.getAllByRole("link", { name: /Terms of Service/ }),
  };
}

describe("Terms and Privacy on the authentication routes", () => {
  it("reaches both documents from sign-in", () => {
    render(<AuthPage emailAction={action} googleAction={googleAction} mode="login" />);

    const { privacy, terms } = legalLinks();
    expect(terms.some((link) => link.getAttribute("href") === "/terms")).toBe(true);
    expect(privacy.some((link) => link.getAttribute("href") === "/privacy")).toBe(true);
  });

  it("opens them in a protected new tab", () => {
    render(<AuthPage emailAction={action} googleAction={googleAction} mode="login" />);

    for (const link of [...legalLinks().terms, ...legalLinks().privacy]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }
  });

  it("states the version and effective date from the document metadata, not from typed copy", () => {
    render(<AuthPage emailAction={action} googleAction={googleAction} mode="login" />);

    expect(
      screen.getByText(
        `Version ${LEGAL_DOCUMENTS.terms.version}, effective ${LEGAL_DOCUMENTS.terms.effectiveDate}`,
      ),
    ).toBeDefined();
  });

  it("appears on registration, check-email, and all three recovery steps", () => {
    const surfaces: Array<[string, () => React.ReactElement]> = [
      [
        "register",
        () => <AuthPage emailAction={action} googleAction={googleAction} mode="register" />,
      ],
      ["check-email", () => <CheckEmailPage />],
      ["forgot-password", () => <ForgotPasswordPage action={action} />],
      ["verify", () => <VerifyRecoveryPage action={action} resendAction={action} />],
      ["reset-password", () => <ResetPasswordPage action={action} />],
    ];

    for (const [name, element] of surfaces) {
      render(element());
      expect(
        screen.getAllByRole("link", { name: /Terms of Service/ }).length,
        name,
      ).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Privacy Notice/ }).length, name).toBeGreaterThan(
        0,
      );
      cleanup();
    }
  });
});

describe("the footer follows document status", () => {
  it("is hidden while either document is a draft", async () => {
    vi.resetModules();
    vi.doMock("@invitica/renderer/legal-documents", async (importActual) => {
      const actual = await importActual<typeof import("@invitica/renderer/legal-documents")>();
      return { ...actual, isLegalAcceptanceEnabled: () => false };
    });

    const { LegalFooter } = await import("../src/components/auth/LegalFooter");
    const { container } = render(<LegalFooter />);

    expect(container.innerHTML).toBe("");

    vi.doUnmock("@invitica/renderer/legal-documents");
    vi.resetModules();
  });
});
