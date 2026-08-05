import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assistantEnabled,
  budgetRefusalMessage,
  consumeAssistantMessage,
} from "../src/server/assistant/budget";

function supabaseReturning(result: { data?: unknown; error?: unknown }) {
  return { rpc: vi.fn().mockResolvedValue({ data: null, error: null, ...result }) } as never;
}

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ASSISTANT_ENABLED = "true";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("the assistant kill switch", () => {
  it("stays on unless it is switched off explicitly", () => {
    delete process.env.ASSISTANT_ENABLED;
    expect(assistantEnabled()).toBe(true);
  });

  it("is off when ASSISTANT_ENABLED is false", () => {
    process.env.ASSISTANT_ENABLED = "false";
    expect(assistantEnabled()).toBe(false);
  });

  it("is off without a key, rather than offering a feature that cannot work", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(assistantEnabled()).toBe(false);
  });
});

describe("spending an assistant message", () => {
  it("allows a message the database accepted", async () => {
    await expect(consumeAssistantMessage(supabaseReturning({ data: "allowed" }))).resolves.toBe(
      "allowed",
    );
  });

  it("passes through which ceiling was reached", async () => {
    await expect(
      consumeAssistantMessage(supabaseReturning({ data: "creator_daily_limit" })),
    ).resolves.toBe("creator_daily_limit");
    await expect(
      consumeAssistantMessage(supabaseReturning({ data: "global_monthly_limit" })),
    ).resolves.toBe("global_monthly_limit");
  });

  it("refuses when the switch is off, without asking the database", async () => {
    process.env.ASSISTANT_ENABLED = "false";
    const supabase = supabaseReturning({ data: "allowed" });

    await expect(consumeAssistantMessage(supabase)).resolves.toBe("disabled");
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the budget cannot be read", async () => {
    // The opposite of the guest throttle, which fails open. There the unbounded thing is a
    // family losing their RSVP; here it is a metered third-party bill.
    await expect(
      consumeAssistantMessage(supabaseReturning({ error: { message: "unreachable" } })),
    ).resolves.toBe("unavailable");

    await expect(
      consumeAssistantMessage({
        rpc: vi.fn().mockRejectedValue(new Error("network")),
      } as never),
    ).resolves.toBe("unavailable");

    await expect(
      consumeAssistantMessage(supabaseReturning({ data: "something else" })),
    ).resolves.toBe("unavailable");
  });
});

describe("refusal wording", () => {
  it("does not promise tomorrow when the ceiling resets next month", () => {
    expect(budgetRefusalMessage("creator_daily_limit")).toContain("tomorrow");
    expect(budgetRefusalMessage("global_monthly_limit")).toContain("next month");
    expect(budgetRefusalMessage("global_monthly_limit")).not.toContain("tomorrow");
  });

  it("has wording for every refusal the budget can return", () => {
    for (const outcome of [
      "creator_daily_limit",
      "disabled",
      "global_monthly_limit",
      "unavailable",
    ] as const) {
      expect(budgetRefusalMessage(outcome).length).toBeGreaterThan(0);
    }
  });
});
