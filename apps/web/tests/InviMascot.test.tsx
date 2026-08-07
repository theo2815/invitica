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

  it("keeps the character decorative while exposing its visual state for styling", () => {
    const { container } = render(<InviMascot state="success" />);
    const mascot = container.querySelector("svg");

    expect(mascot?.getAttribute("aria-hidden")).toBe("true");
    expect(mascot?.getAttribute("data-invi-state")).toBe("success");
  });

  it("draws the sealed letter rather than a face on its own", () => {
    const { container } = render(<InviMascot state="attentive" />);

    // The three pieces the identity is: the note, the pocket it sits in, and the wax seal. A
    // face floating without them would be a different character wearing the same name.
    expect(container.querySelector("[class*='paper']")).not.toBeNull();
    expect(container.querySelector("[class*='pocket']")).not.toBeNull();
    expect(container.querySelector("[class*='seal']")).not.toBeNull();
  });
});
