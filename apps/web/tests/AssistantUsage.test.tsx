import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssistantUsage } from "../src/server/assistant/usage";

const readUsage = vi.fn(async (): Promise<AssistantUsage | null> => null);

vi.mock("../src/server/assistant/actions", () => ({
  deleteAssistantConversationAction: async () => undefined,
  listAssistantConversationsAction: async () => [],
  loadAssistantConversationAction: async () => null,
  readAssistantUsageAction: () => readUsage(),
  saveAssistantConversationAction: async () => null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/assistant",
  useRouter: () => ({ push: vi.fn() }),
}));

const { AssistantProvider } = await import("../src/components/assistant/AssistantProvider");
const { AssistantUsageLine, AssistantUsageMeter } = await import(
  "../src/components/assistant/AssistantUsage"
);

/**
 * The daily allowance, shown.
 *
 * A creator gets twenty messages a Manila day across all three modes, and before this they
 * had no way to know how many were left until the twenty-first was refused. What these cases
 * hold is that every state says its number in words — the bar is decoration and is hidden
 * from assistive technology — and that a count which cannot be read is reported as unknown
 * rather than as zero. Telling a creator they have no messages when the truth is that a query
 * failed would stop them using a feature that still works.
 */
function usage(used: number): AssistantUsage {
  return {
    dailyLimit: 20,
    // A fixed instant. The rendered time is the reader's own clock, so these cases assert
    // that a reset is named rather than what hour a test machine calls it.
    resetsAt: "2026-08-07T16:00:00.000Z",
    used,
  };
}

function renderMeter() {
  return render(
    <AssistantProvider>
      <AssistantUsageMeter />
      <AssistantUsageLine />
    </AssistantProvider>,
  );
}

beforeEach(() => {
  readUsage.mockReset();
  readUsage.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
});

describe("the daily message allowance", () => {
  it("reads the count on mount rather than making the creator ask for it", async () => {
    readUsage.mockResolvedValue(usage(6));
    renderMeter();

    expect(await screen.findByText(/of 20 left$/)).toBeTruthy();
    expect(readUsage).toHaveBeenCalledTimes(1);
  });

  it("states used, left, the cap, and when they come back", async () => {
    readUsage.mockResolvedValue(usage(6));
    renderMeter();

    const meter = await screen.findByRole("region", { name: "Today's messages with Invi" });
    expect(meter.textContent).toContain("14");
    expect(meter.textContent).toContain("of 20 left");
    expect(meter.textContent).toContain("6 used so far");
    expect(meter.textContent).toContain("they reset at");
  });

  it("says all three modes share the one allowance, because they do", async () => {
    readUsage.mockResolvedValue(usage(2));
    renderMeter();

    const meter = await screen.findByRole("region", { name: "Today's messages with Invi" });
    expect(meter.textContent).toContain("Questions, drafts, and guest lists");
  });

  it("changes what it says close to the limit without changing only its colour", async () => {
    readUsage.mockResolvedValue(usage(17));
    const view = renderMeter();

    const meter = await screen.findByRole("region", { name: "Today's messages with Invi" });
    expect(meter.getAttribute("data-level")).toBe("low");
    // The words carry it: three left, and the cost of a draft is named while there is still
    // time to spend the rest differently.
    expect(meter.textContent).toContain("3");
    expect(meter.textContent).toContain("Drafting an invitation costs the same one message");
    expect(view.container.textContent).toContain("3 of 20 left today");
  });

  it("says what happens at the limit only once the limit is reached", async () => {
    readUsage.mockResolvedValue(usage(20));
    const view = renderMeter();

    const meter = await screen.findByRole("region", { name: "Today's messages with Invi" });
    expect(meter.getAttribute("data-level")).toBe("spent");
    expect(meter.textContent).toContain("You have used all 20 of today's messages");
    expect(meter.textContent).toContain("cannot answer, draft, or read a guest list");
    // The reassurance matters more here than anywhere else: running out of messages is not
    // losing work.
    expect(meter.textContent).toContain("Nothing you have already saved is affected");
    expect(view.container.textContent).toContain("No messages left today");
  });

  it("reports a count it could not read as unknown, never as none left", async () => {
    readUsage.mockResolvedValue(null);
    const view = renderMeter();

    const meter = await screen.findByRole("region", { name: "Today's messages with Invi" });
    expect(meter.getAttribute("data-level")).toBe("unknown");
    expect(meter.textContent).toContain("could not be loaded");
    expect(meter.textContent).toContain("Invi still works");
    expect(meter.textContent).not.toContain("0 of 20");
    // The composer line stays silent rather than apologising in a panel with no room for it.
    expect(view.container.textContent).not.toContain("left today");
  });

  it("offers a retry when the count could not be read", async () => {
    readUsage.mockResolvedValue(null);
    renderMeter();

    const retry = await screen.findByRole("button", { name: "Try again" });
    readUsage.mockResolvedValue(usage(4));
    fireEvent.click(retry);

    const meter = await screen.findByRole("region", { name: "Today's messages with Invi" });
    expect(meter.textContent).toContain("16");
    expect(meter.textContent).toContain("of 20 left");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps the last good numbers when a later read fails", async () => {
    readUsage.mockResolvedValue(usage(4));
    renderMeter();
    await screen.findByText(/of 20 left$/);

    readUsage.mockResolvedValue(null);
    fireEvent.click(screen.getByRole("region", { name: "Today's messages with Invi" }));

    // A dropped request is not evidence that the allowance changed, so a slightly stale
    // number beats blanking a meter the creator was reading.
    expect(
      screen.getByRole("region", { name: "Today's messages with Invi" }).textContent,
    ).toContain("of 20 left");
  });

  it("keeps the bar out of the accessibility tree", async () => {
    readUsage.mockResolvedValue(usage(6));
    const view = renderMeter();
    await screen.findByText(/of 20 left$/);

    const bar = view.container.querySelector('[aria-hidden="true"] > span');
    expect(bar).toBeTruthy();
    expect((bar as HTMLElement).style.width).toBe("30%");
  });
});
