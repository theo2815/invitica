import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthPage } from "../src/components/auth/AuthPage";
import { ResetPasswordPage } from "../src/components/auth/PasswordRecoveryPage";
import { assessPassword } from "../src/server/auth/password-strength";

const emailAction = vi.fn(async () => ({ error: null }));
const googleAction = vi.fn(async () => {});

afterEach(cleanup);

function renderRegister() {
  render(<AuthPage emailAction={emailAction} googleAction={googleAction} mode="register" />);
  return {
    confirm: screen.getByLabelText("Confirm password") as HTMLInputElement,
    password: screen.getByLabelText("Password") as HTMLInputElement,
  };
}

describe("the strength meter on registration", () => {
  it("stays hidden until something is typed", () => {
    renderRegister();

    expect(screen.queryByText(/Password strength/)).toBeNull();
  });

  it("names the band in words, not only in colour", () => {
    const { password } = renderRegister();

    fireEvent.change(password, { target: { value: "cedarwalnut" } });
    expect(screen.getByText("Weak")).toBeDefined();

    fireEvent.change(password, { target: { value: "Willow-marble-thistle-cobalt-41" } });
    expect(screen.getByText("Strong")).toBeDefined();
  });

  it("ticks each requirement as it is met", () => {
    const { password } = renderRegister();

    fireEvent.change(password, { target: { value: "short" } });
    expect(screen.getByText("At least 10 characters").closest("li")?.dataset.met).toBe("false");

    fireEvent.change(password, { target: { value: "Willow-marble-thistle-cobalt-41" } });
    expect(screen.getByText("At least 10 characters").closest("li")?.dataset.met).toBe("true");
    expect(screen.getByText("Not a predictable password").closest("li")?.dataset.met).toBe("true");
    expect(screen.getByText("Not your name or email address").closest("li")?.dataset.met).toBe(
      "true",
    );
  });

  it("reads the creator's own name and email from the form as they type", () => {
    const { password } = renderRegister();

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Maria Santos" } });
    fireEvent.change(password, { target: { value: "MariaSantos2026" } });

    expect(screen.getByText("Not your name or email address").closest("li")?.dataset.met).toBe(
      "false",
    );
  });

  it("describes the password input by its meter", () => {
    const { password } = renderRegister();

    fireEvent.change(password, { target: { value: "cedar-walnut-33" } });
    expect(password.getAttribute("aria-describedby")).toContain("register-password-strength");
  });
});

describe("the password generator", () => {
  it("fills both fields with the same accepted value and reveals it", () => {
    const { confirm, password } = renderRegister();

    fireEvent.click(screen.getByRole("button", { name: "Suggest a strong password" }));

    expect(password.value.length).toBeGreaterThan(20);
    expect(confirm.value).toBe(password.value);
    expect(assessPassword(password.value).acceptable).toBe(true);
    // Revealed, because a password rendered as dots is one nobody writes down.
    expect(password.type).toBe("text");
    expect(screen.getByText("Strong")).toBeDefined();
  });

  it("is offered on the recovery reset form too, and not on sign-in", () => {
    render(<ResetPasswordPage action={emailAction} />);
    expect(screen.getByRole("button", { name: "Suggest a strong password" })).toBeDefined();
    cleanup();

    render(<AuthPage emailAction={emailAction} googleAction={googleAction} mode="login" />);
    expect(screen.queryByRole("button", { name: "Suggest a strong password" })).toBeNull();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeDefined();
  });
});
