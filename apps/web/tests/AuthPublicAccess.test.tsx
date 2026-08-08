import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ForgotPasswordRoute from "../app/(auth)/forgot-password/page";
import LoginPage from "../app/(auth)/login/page";
import RegisterPage from "../app/(auth)/register/page";
import { AuthPage } from "../src/components/auth/AuthPage";

/**
 * The inverse of the file this replaces.
 *
 * `AuthBetaGate.test.tsx` asserted that account creation, Google sign-in, and password recovery
 * were hidden and refused in production. `publicAuthLocked()` is gone as of 2026-08-08, so these
 * assert the opposite: every public path is reachable, and no route redirects to a beta notice.
 */

// redirect() throws in Next; the sentinel makes an unexpected redirect a loud failure rather than
// a silently rendered page.
vi.mock("next/navigation", async (importActual) => {
  const actual = await importActual<typeof import("next/navigation")>();
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
  };
});

vi.mock("../src/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));

const emailAction = vi.fn(async () => ({ error: null }));
const googleAction = vi.fn(async () => {});

afterEach(cleanup);

describe("AuthPage public controls", () => {
  it("offers Google, account creation, and recovery on sign-in", () => {
    render(<AuthPage emailAction={emailAction} googleAction={googleAction} mode="login" />);

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Create an account" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeDefined();
  });

  it("offers Google and a way back to sign-in on registration", () => {
    render(<AuthPage emailAction={emailAction} googleAction={googleAction} mode="register" />);

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeDefined();
    expect(screen.getByLabelText("Full name")).toBeDefined();
  });
});

describe("public auth routes", () => {
  it("renders the login page with all three controls", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Create an account" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeDefined();
  });

  it("renders /register instead of redirecting", async () => {
    render(await RegisterPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Create your account" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDefined();
  });

  it("renders /forgot-password instead of redirecting", () => {
    render(ForgotPasswordRoute());

    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Send recovery code" })).toBeDefined();
  });
});
