import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssistantAnswer, parseAnswerBlocks } from "../src/components/assistant/AssistantAnswer";

afterEach(cleanup);

describe("reading a Tala answer", () => {
  it("renders bold emphasis instead of the asterisks around it", () => {
    // The complaint this exists for: the help corpus is Markdown, the model mirrors it,
    // and the thread used to print the marks as literal characters.
    render(<AssistantAnswer text="Go to **Guests & RSVPs** and press **Copy invitation**." />);

    expect(screen.getByText("Guests & RSVPs").tagName).toBe("STRONG");
    expect(screen.getByText("Copy invitation").tagName).toBe("STRONG");
    expect(document.body.textContent).not.toContain("**");
  });

  it("drops an empty emphasis pair rather than printing four asterisks", () => {
    render(<AssistantAnswer text="Use the general link. ****" />);

    expect(document.body.textContent).not.toContain("*");
  });

  it("leaves a half-arrived mark alone until its closing pair lands", () => {
    // Rendered on every streamed chunk, so this is the state the thread is in for most of
    // an answer. An unpaired mark must not swallow the rest of the sentence.
    const { rerender } = render(<AssistantAnswer text="Open **Guests" />);
    expect(document.body.textContent).toContain("Open **Guests");

    rerender(<AssistantAnswer text="Open **Guests & RSVPs**." />);
    expect(screen.getByText("Guests & RSVPs").tagName).toBe("STRONG");
  });

  it("turns numbered lines into a real ordered list", () => {
    render(
      <AssistantAnswer
        text={
          "Send a personal link:\n\n1. Open Guests & RSVPs.\n2. Find their party.\n3. Press Copy invitation."
        }
      />,
    );

    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]?.textContent).toBe("Open Guests & RSVPs.");
    expect(document.querySelector("ol")).toBeTruthy();
  });

  it("turns dashed lines into a real bulleted list", () => {
    render(
      <AssistantAnswer text={"Two kinds of link:\n\n- A personal link.\n- The general link."} />,
    );

    expect(document.querySelector("ul")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("joins a hard-wrapped paragraph and splits on a blank line", () => {
    const blocks = parseAnswerBlocks(
      "The general link\nhas no reply form.\n\nUse a personal link.",
    );

    expect(blocks).toHaveLength(2);

    render(<AssistantAnswer text={"The general link\nhas no reply form."} />);
    const paragraphs = document.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    // Rejoined with a space, not with the model's arbitrary wrap position.
    expect(paragraphs[0]?.textContent).toBe("The general link has no reply form.");
  });

  it("keeps anything it does not understand as plain text", () => {
    // The output is React elements, never HTML built from a string, so a model that
    // writes a tag writes visible characters.
    render(<AssistantAnswer text="Press <b>Publish</b> to go live." />);

    expect(document.querySelector("b")).toBeNull();
    expect(document.body.textContent).toContain("<b>Publish</b>");
  });

  it("renders nothing at all for an answer that has not started", () => {
    const { container } = render(<AssistantAnswer text="" />);

    expect(container.querySelectorAll("p, ul, ol")).toHaveLength(0);
  });
});
