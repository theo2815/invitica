import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LegalAcceptanceGate } from "../src/components/legal/LegalAcceptanceGate";

vi.mock("../src/server/legal/actions", () => ({
  acceptCurrentTerms: vi.fn(async () => ({ error: null })),
}));

afterEach(cleanup);

describe("legal acceptance gate", () => {
  it("uses one explicit native checkbox and preserves the safe return path", () => {
    render(<LegalAcceptanceGate nextPath="/dashboard/templates?from=preview" />);

    const checkbox = screen.getByRole("checkbox", {
      name: /I agree to the current Terms of Service/,
    }) as HTMLInputElement;
    fireEvent.submit(screen.getByRole("form", { name: "Accept the current Terms of Service" }));

    expect(screen.getByText("Agree to the current Terms of Service to continue.")).toBeDefined();
    expect(document.activeElement).toBe(checkbox);
    expect(
      screen
        .getByRole("form", { name: "Accept the current Terms of Service" })
        .querySelector<HTMLInputElement>('input[name="next"]')?.value,
    ).toBe("/dashboard/templates?from=preview");
    expect(screen.getAllByRole("link", { name: /opens in a new tab/ })).toHaveLength(2);
  });
});
