import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { resolveTalaState, TalaMascot } from "../src/components/assistant/TalaMascot";

describe("Tala", () => {
  it("maps assistant facts to expressions without interpreting message meaning", () => {
    const idle = {
      active: false,
      hasNotice: false,
      hasProposal: false,
      status: "idle" as const,
    };

    expect(resolveTalaState(idle)).toBe("idle");
    expect(resolveTalaState({ ...idle, active: true })).toBe("attentive");
    expect(resolveTalaState({ ...idle, active: true, status: "answering" })).toBe("thinking");
    expect(
      resolveTalaState({
        ...idle,
        active: true,
        latestMessage: { content: "Here is the answer.", role: "assistant" },
        status: "answering",
      }),
    ).toBe("responding");
    expect(resolveTalaState({ ...idle, active: true, hasProposal: true })).toBe("success");
    expect(resolveTalaState({ ...idle, active: true, hasNotice: true, status: "answering" })).toBe(
      "attention",
    );
  });

  it("keeps the character decorative while exposing its visual state for styling", () => {
    const { container } = render(<TalaMascot state="success" />);
    const mascot = container.querySelector("svg");

    expect(mascot?.getAttribute("aria-hidden")).toBe("true");
    expect(mascot?.getAttribute("data-tala-state")).toBe("success");
  });
});
