import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assistantEnabled,
  budgetRefusalMessage,
  clearAssistantMisconfigured,
  consumeAssistantMessage,
  markAssistantMisconfigured,
} from "../src/server/assistant/budget";

function supabaseReturning(result: { data?: unknown; error?: unknown }) {
  return { rpc: vi.fn().mockResolvedValue({ data: null, error: null, ...result }) } as never;
}

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ASSISTANT_ENABLED = "true";
  // Module state; one test must not decide the next one's outcome.
  clearAssistantMisconfigured();
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
      "misconfigured",
      "unavailable",
    ] as const) {
      expect(budgetRefusalMessage(outcome).length).toBeGreaterThan(0);
    }
  });
});

/**
 * The budget is spent before the model is called, which is right when the deployment works
 * and wrong when it does not: a rejected key is never billed, so charging a message for it
 * takes from the creator and saves nothing.
 */
describe("after the provider rejects our credentials", () => {
  it("refuses without touching the database", async () => {
    const supabase = supabaseReturning({ data: "allowed" });
    markAssistantMisconfigured();

    expect(await consumeAssistantMessage(supabase)).toBe("misconfigured");
    // The allowance is untouched — the RPC that spends it is never reached.
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("blames Invitica rather than the creator, and says the allowance is intact", () => {
    const message = budgetRefusalMessage("misconfigured");
    expect(message).toContain("Invitica");
    expect(message).toContain("not using up your daily messages");
  });

  it("comes back once the configuration is corrected", async () => {
    markAssistantMisconfigured();
    clearAssistantMisconfigured();

    expect(await consumeAssistantMessage(supabaseReturning({ data: "allowed" }))).toBe("allowed");
  });

  it("leaves the kill switch alone, so the surface does not vanish mid-session", () => {
    markAssistantMisconfigured();
    // A creator watching the panel disappear learns less than one reading why it refused.
    expect(assistantEnabled()).toBe(true);
  });
});
