import { RomanticResponsePreview } from "@invitica/renderer";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("RomanticResponsePreview", () => {
  it("moves No five pointer attempts and accepts it on the sixth", () => {
    const { container } = render(<RomanticResponsePreview declineButtonBehavior="dodge-five" />);
    const no = screen.getByRole("button", { name: "No" });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      fireEvent.click(no, { detail: 1 });
      expect(container.querySelector(".rq-choices")?.getAttribute("data-dodge-step")).toBe(
        String(attempt),
      );
      expect(screen.queryByRole("textbox")).toBeNull();
    }

    fireEvent.click(no, { detail: 1 });
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("lets keyboard and reduced-motion users choose No immediately", () => {
    const keyboardView = render(<RomanticResponsePreview declineButtonBehavior="dodge-five" />);
    fireEvent.click(screen.getByRole("button", { name: "No" }), { detail: 0 });
    expect(screen.getByRole("textbox")).toBeTruthy();
    keyboardView.unmount();

    render(<RomanticResponsePreview declineButtonBehavior="dodge-five" reducedMotion />);
    fireEvent.click(screen.getByRole("button", { name: "No" }), { detail: 1 });
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("requires a non-blank decline message", () => {
    const { container } = render(<RomanticResponsePreview declineButtonBehavior="static" />);
    fireEvent.click(screen.getByRole("button", { name: "No" }), { detail: 1 });

    const message = screen.getByRole("textbox", { name: "Please leave a message." });
    expect(container.querySelector("style")?.textContent).toContain(".rq-message-form");
    fireEvent.change(message, { target: { value: "   " } });
    fireEvent.submit(message.closest("form") as HTMLFormElement);
    expect(screen.queryByText("A no, then.")).toBeNull();

    fireEvent.change(message, { target: { value: "I cannot make it, but thank you for asking." } });
    fireEvent.submit(message.closest("form") as HTMLFormElement);
    expect(screen.getByText("A no, then.")).toBeTruthy();
    expect(container.querySelector("style")?.textContent).toContain(".rq-preview-result");
  });

  it("offers an optional note before accepting Yes", () => {
    render(<RomanticResponsePreview declineButtonBehavior="static" />);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    const message = screen.getByRole("textbox", { name: "Add a note, if you would like." });
    expect(message.hasAttribute("required")).toBe(false);
    expect(screen.getByText("Optional")).toBeTruthy();

    fireEvent.submit(message.closest("form") as HTMLFormElement);
    expect(screen.getByText("Yes it is.")).toBeTruthy();
  });

  it("pleads once per dodge and keeps the plea out of the accessibility tree", () => {
    const { container } = render(<RomanticResponsePreview declineButtonBehavior="dodge-five" />);
    const plea = container.querySelector(".rq-plea") as HTMLElement;
    const no = screen.getByRole("button", { name: "No" });

    // The bubble holds its row from the start so the first dodge moves nothing but the button.
    expect(plea.getAttribute("data-shown")).toBe("false");
    expect(plea.getAttribute("aria-hidden")).toBe("true");

    const lines: string[] = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      fireEvent.click(no, { detail: 1 });
      const shown = container.querySelector(".rq-plea") as HTMLElement;
      expect(shown.getAttribute("data-shown")).toBe("true");
      lines.push(shown.textContent ?? "");
    }

    expect(new Set(lines).size).toBe(5);
    expect(lines[0]).toBe("Please?");
    expect(lines[4]).toBe("Okay. Tell me why?");
  });

  it("gives no plea to the paths that never dodge", () => {
    const staticView = render(<RomanticResponsePreview declineButtonBehavior="static" />);
    expect(staticView.container.querySelector(".rq-plea")).toBeNull();
    staticView.unmount();

    const reducedView = render(
      <RomanticResponsePreview declineButtonBehavior="dodge-five" reducedMotion />,
    );
    expect(reducedView.container.querySelector(".rq-plea")).toBeNull();
  });

  it("ends each answer on a face that matches it", () => {
    const { container } = render(<RomanticResponsePreview declineButtonBehavior="static" />);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }), { detail: 1 });
    fireEvent.submit(screen.getByRole("textbox").closest("form") as HTMLFormElement);

    // The tear and the rising heart are the two marks that separate the faces, and both are filled
    // by presentation attribute because every mount point declares `fill: none` on the svg itself.
    const yesMark = container.querySelector(".rq-result-mark svg") as SVGElement;
    expect(yesMark.querySelectorAll('[fill="currentcolor"]')).toHaveLength(1);
    const yesPaths = yesMark.innerHTML;

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "No" }), { detail: 1 });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "I am sorry." } });
    fireEvent.submit(screen.getByRole("textbox").closest("form") as HTMLFormElement);

    const noMark = container.querySelector(".rq-result-mark svg") as SVGElement;
    expect(noMark.innerHTML).not.toBe(yesPaths);
    expect(noMark.querySelector("circle")).toBeTruthy();
  });
});
