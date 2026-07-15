import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "../app/(auth)/login/page";
import RegisterCheckEmailPage from "../app/(auth)/register/check-email/page";
import RegisterPage from "../app/(auth)/register/page";
import { signInWithEmail } from "../src/server/auth/actions";

vi.mock("../src/server/auth/actions", () => ({
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signUpWithEmail: vi.fn(),
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
    expect(screen.queryByLabelText("Full name")).toBeNull();
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe(
      "/register",
    );
    expect(screen.getByRole("link", { name: "Invitica home" }).getAttribute("href")).toBe("/");
  });

  it("renders the registration route with all required account fields", () => {
    render(createElement(RegisterPage));

    expect(screen.getByRole("heading", { level: 1, name: "Create your account" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDefined();
    expect(screen.getByLabelText("Full name").getAttribute("name")).toBe("fullName");
    expect(screen.getByLabelText("Email address").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText("Confirm password").getAttribute("name")).toBe("confirmPassword");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  it("announces an inline error returned by the email action", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({
      error: "Email or password is incorrect.",
    });
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

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

  it("shows generic email confirmation guidance without personal data", () => {
    render(createElement(RegisterCheckEmailPage));

    expect(screen.getByRole("heading", { level: 1, name: "Check your inbox" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe(
      "/login",
    );
  });
});
