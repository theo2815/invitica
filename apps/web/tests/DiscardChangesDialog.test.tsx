import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscardChangesDialog } from "../src/components/feedback/DiscardChangesDialog";

const onDiscard = vi.fn();
const onKeepEditing = vi.fn();

function renderDialog() {
  return render(
    <DiscardChangesDialog
      description="Nothing has been created yet. These rows and your conversation with Invi will be gone."
      eyebrow="Add guests"
      onDiscard={onDiscard}
      onKeepEditing={onKeepEditing}
      title="Discard these guest rows?"
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the discard confirmation", () => {
  it("opens with the safe answer focused", () => {
    renderDialog();

    // A confirmation whose default answer throws work away is worse than no confirmation.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep editing" }));
  });

  it("treats Escape as Keep editing", () => {
    renderDialog();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("discards only on the explicit choice", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onKeepEditing).not.toHaveBeenCalled();
  });

  it("keeps Tab inside itself rather than letting it reach the form underneath", () => {
    renderDialog();

    const keep = screen.getByRole("button", { name: "Keep editing" });
    const discard = screen.getByRole("button", { name: "Discard" });

    // Forward from the last control wraps to the first, and back from the first wraps to the
    // last. Without this the parent dialog's own trap would take over and walk into the very
    // fields this question is protecting.
    discard.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(keep);

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(discard);
  });

  it("names itself for assistive technology through its own title and description", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Discard these guest rows?",
    );
    expect(
      document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toContain("Nothing has been created yet");
  });
});
