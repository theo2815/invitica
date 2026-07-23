import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ForgotPasswordPage from "../app/(auth)/forgot-password/page";
import VerifyRecoveryPage from "../app/(auth)/forgot-password/verify/page";
import LoginPage from "../app/(auth)/login/page";
import RegisterCheckEmailPage from "../app/(auth)/register/check-email/page";
import RegisterPage from "../app/(auth)/register/page";
import ResetPasswordPage from "../app/(auth)/reset-password/page";
import { signInWithEmail } from "../src/server/auth/actions";

vi.mock("../src/server/auth/actions", () => ({
  requestPasswordReset: vi.fn(),
  resendRecoveryCode: vi.fn(),
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signUpWithEmail: vi.fn(),
  updatePassword: vi.fn(),
  verifyRecoveryCode: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(signInWithEmail).mockReset();
});

describe("Invitica authentication pages", () => {
  it("renders the login route with its email and Google paths", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDefined();
    expect(screen.getByLabelText("Email address").getAttribute("name")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("name")).toBe("password");
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe(
      "/forgot-password",
    );
    expect(screen.queryByLabelText("Full name")).toBeNull();
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe(
      "/register",
    );
    expect(screen.getByRole("link", { name: "Invitica home" }).getAttribute("href")).toBe("/");
  });

  it("renders the registration route with all required account fields", async () => {
    render(await RegisterPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Create your account" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDefined();
    expect(screen.getByLabelText("Full name").getAttribute("name")).toBe("fullName");
    expect(screen.getByLabelText("Email address").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText("Confirm password").getAttribute("name")).toBe("confirmPassword");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  it("replaces generic browser required messages with friendly inline guidance", async () => {
    render(await RegisterPage({ searchParams: Promise.resolve({}) }));

    fireEvent.submit(screen.getByRole("form", { name: "Create an account with email" }));

    expect(screen.getByText("Enter your full name.")).toBeDefined();
    expect(screen.getByText("Enter your email address.")).toBeDefined();
    expect(screen.getByText("Create a password.")).toBeDefined();
    expect(screen.getByText("Re-enter your password.")).toBeDefined();
    expect(screen.getByLabelText("Full name").getAttribute("aria-invalid")).toBe("true");
  });

  it("keeps registration values and shows friendly field errors for mismatched passwords", async () => {
    render(await RegisterPage({ searchParams: Promise.resolve({}) }));

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Maria Santos" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "maria@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-secure-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "a-different-password" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Create an account with email" }));

    expect(screen.getByText("Your passwords do not match.")).toBeDefined();
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Maria Santos");
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe(
      "maria@example.com",
    );
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("a-secure-password");
    expect((screen.getByLabelText("Confirm password") as HTMLInputElement).value).toBe(
      "a-different-password",
    );
    expect(screen.getByLabelText("Confirm password").getAttribute("aria-invalid")).toBe("true");
  });

  it("uses accessible password visibility controls", async () => {
    render(await RegisterPage({ searchParams: Promise.resolve({}) }));

    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("type")).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("announces an inline error returned by the email action", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({
      error: "Email or password is incorrect.",
    });
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "maria@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "incorrect-password" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Sign in with email" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Email or password is incorrect.");
    });
  });

  it("maps only allowlisted callback errors", async () => {
    const { unmount } = render(
      await LoginPage({ searchParams: Promise.resolve({ error: "oauth" }) }),
    );
    expect(screen.getByRole("alert").textContent).toContain("Google sign-in");
    unmount();

    render(await LoginPage({ searchParams: Promise.resolve({ error: "arbitrary user text" }) }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("preserves a safe template-preview return path across login and registration", async () => {
    const next = "/templates/garden-promise/preview?intent=use";
    const login = render(await LoginPage({ searchParams: Promise.resolve({ next }) }));

    expect(
      screen
        .getByRole("form", { name: "Sign in with email" })
        .querySelector<HTMLInputElement>('input[name="next"]')?.value,
    ).toBe(next);
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe(
      `/register?next=${encodeURIComponent(next)}`,
    );
    login.unmount();

    render(await RegisterPage({ searchParams: Promise.resolve({ next }) }));
    expect(
      screen
        .getByRole("form", { name: "Create an account with email" })
        .querySelector<HTMLInputElement>('input[name="next"]')?.value,
    ).toBe(next);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      `/login?next=${encodeURIComponent(next)}`,
    );
  });

  it("shows generic email confirmation guidance without personal data", () => {
    render(createElement(RegisterCheckEmailPage));

    expect(screen.getByRole("heading", { level: 1, name: "Check your inbox" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe(
      "/login",
    );
  });

  it("provides the complete email, OTP, and new-password recovery sequence", async () => {
    const { unmount } = render(createElement(ForgotPasswordPage));
    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeDefined();
    expect(screen.getByRole("form", { name: "Request a password recovery code" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe(
      "/login",
    );
    unmount();

    render(createElement(VerifyRecoveryPage));
    const otp = screen.getByLabelText("Recovery code");
    expect(otp.getAttribute("autocomplete")).toBe("one-time-code");
    expect(otp.getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByRole("button", { name: "Verify code" })).toBeDefined();
    unmount();

    render(await ResetPasswordPage());
    expect(screen.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeDefined();
    expect(screen.getByLabelText("New password").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("Confirm new password").getAttribute("type")).toBe("password");
  });
});
