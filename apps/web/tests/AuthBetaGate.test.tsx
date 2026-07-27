import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ForgotPasswordRoute from "../app/(auth)/forgot-password/page";
import LoginPage from "../app/(auth)/login/page";
import RegisterPage from "../app/(auth)/register/page";
import { AuthPage } from "../src/components/auth/AuthPage";
import {
  requestPasswordReset,
  signInWithGoogle,
  signUpWithEmail,
} from "../src/server/auth/actions";

// The production beta lock is on for this whole file, so the routes, controls, and server actions
// should all refuse account creation, Google sign-in, and password recovery.
vi.mock("../src/server/auth/beta-gate", () => ({ publicAuthLocked: () => true }));

// redirect() throws in Next; the sentinel lets the tests assert the exact target without navigating.
vi.mock("next/navigation", async (importActual) => {
  const actual = await importActual<typeof import("next/navigation")>();
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
  };
});

// Keeps importing the auth actions free of a real Supabase client; the beta guards return first anyway.
vi.mock("../src/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));

const emailAction = vi.fn(async () => ({ error: null }));
const googleAction = vi.fn(async () => {});

afterEach(cleanup);

describe("AuthPage beta lock (component)", () => {
  it("shows account creation, Google, and recovery when not locked", () => {
    render(<AuthPage emailAction={emailAction} googleAction={googleAction} mode="login" />);

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Create an account" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeDefined();
  });

  it("hides them when locked, keeping email + password sign-in", () => {
    render(
      <AuthPage betaLocked emailAction={emailAction} googleAction={googleAction} mode="login" />,
    );

    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Forgot password?" })).toBeNull();
    expect(screen.getByLabelText("Email address")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
  });
});

describe("auth routes under the production beta lock", () => {
  it("keeps the login page reachable with the three controls hidden", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Forgot password?" })).toBeNull();
  });

  it("redirects /register to sign-in with a beta notice", async () => {
    await expect(RegisterPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect:/login?message=beta",
    );
  });

  it("redirects /forgot-password to sign-in with a beta notice", () => {
    expect(() => ForgotPasswordRoute()).toThrow("redirect:/login?message=beta");
  });
});

describe("auth actions under the production beta lock", () => {
  it("refuses account creation", async () => {
    const result = await signUpWithEmail({ error: null }, new FormData());
    expect(result.error).toContain("beta");
  });

  it("refuses password recovery", async () => {
    const result = await requestPasswordReset({ error: null }, new FormData());
    expect(result.error).toContain("beta");
  });

  it("refuses Google sign-in", async () => {
    await expect(signInWithGoogle(new FormData())).rejects.toThrow("redirect:/login?message=beta");
  });
});
