import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InviMascot, resolveInviState } from "../src/components/assistant/InviMascot";

describe("Invi", () => {
  it("maps assistant facts to expressions without interpreting message meaning", () => {
    const idle = {
      active: false,
      hasNotice: false,
      hasProposal: false,
      status: "idle" as const,
    };

    expect(resolveInviState(idle)).toBe("idle");
    expect(resolveInviState({ ...idle, active: true })).toBe("attentive");
    expect(resolveInviState({ ...idle, active: true, status: "answering" })).toBe("thinking");
    expect(
      resolveInviState({
        ...idle,
        active: true,
        latestMessage: { content: "Here is the answer.", role: "assistant" },
        status: "answering",
      }),
    ).toBe("responding");
    expect(resolveInviState({ ...idle, active: true, hasProposal: true })).toBe("success");
    expect(resolveInviState({ ...idle, active: true, hasNotice: true, status: "answering" })).toBe(
      "attention",
    );
  });

  it.each([
    ["attention", "alert"],
    ["attentive", "neutral"],
    ["idle", "resting"],
    ["responding", "neutral"],
    ["success", "success"],
    ["thinking", "thinking"],
  ] as const)("maps the %s state to the authored %s frame", (state, frame) => {
    const { container } = render(<InviMascot state={state} />);
    const mascot = container.querySelector("[data-invi-state]");

    expect(mascot?.getAttribute("aria-hidden")).toBe("true");
    expect(mascot?.getAttribute("data-invi-frame")).toBe(frame);
    expect(container.querySelector('[data-invi-sprite="concept-e"]')).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("ships the optimized Concept E atlas with the web app", () => {
    const assetPath = resolve(process.cwd(), "public/brand/invi-character-sprites.webp");

    expect(existsSync(assetPath)).toBe(true);
    expect(statSync(assetPath).size).toBeLessThan(400_000);
  });
});
