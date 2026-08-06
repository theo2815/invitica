import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestShareMessages } from "../src/components/assistant/message-writing";
import { GuestShareMessageEditor } from "../src/components/guests/GuestShareMessageEditor";
import { saveInvitationShareMessagesAction } from "../src/server/guests/actions";
import type { GuestInvitationSummary } from "../src/server/guests/guests";

vi.mock("../src/server/guests/actions", () => ({
  saveInvitationShareMessagesAction: vi.fn(),
}));
vi.mock("../src/components/assistant/message-writing", () => ({
  requestShareMessages: vi.fn(),
}));

/** Invented. No fixture in this repository carries a real invitation or guest. */
const invitation: GuestInvitationSummary = {
  celebrantPronoun: "they",
  generalShareMessage: null,
  genericUrl: `http://localhost:3000/i/mara-and-joaquin-${"a".repeat(32)}`,
  invitationId: "73000000-0000-4000-8000-000000000001",
  occasion: "Wedding",
  personalShareMessage: null,
  publicIdentifier: "a".repeat(32),
  title: "Mara & Joaquin",
};

const personal = "Hi, {recipient} — we would love you at {celebrant}'s {occasion}. {link}";
const general = "Dear, Family & Friends — {celebrant}'s {occasion} is here. {link}";

const onClose = vi.fn();
const onSaved = vi.fn();

function renderEditor({
  assistantAvailable = true,
  personalOnly = false,
  stored = {},
}: {
  assistantAvailable?: boolean;
  personalOnly?: boolean;
  stored?: Partial<GuestInvitationSummary>;
} = {}) {
  return render(
    <GuestShareMessageEditor
      assistantAvailable={assistantAvailable}
      invitation={{ ...invitation, ...stored }}
      onClose={onClose}
      onSaved={onSaved}
      personalOnly={personalOnly}
    />,
  );
}

function personalField() {
  return screen.getByLabelText("Personal message, for one guest party") as HTMLTextAreaElement;
}

function generalField() {
  return screen.getByLabelText("General message, for sharing with everyone") as HTMLTextAreaElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("writing an invitation message with Tala", () => {
  it("puts what Tala wrote into the fields without saving anything", async () => {
    vi.mocked(requestShareMessages).mockResolvedValue({
      general,
      personal,
      questions: [],
      status: "written",
    });

    renderEditor();

    fireEvent.change(screen.getByLabelText(/Describe it and let Tala write it/), {
      target: { value: "warm but short, mention it is a garden ceremony" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write with Tala" }));

    await waitFor(() => expect(personalField().value).toBe(personal));
    expect(generalField().value).toBe(general);

    // The creator's own Save is still the only thing that commits.
    expect(saveInvitationShareMessagesAction).not.toHaveBeenCalled();
  });

  it("shows the wording in the live preview against real invitation data", async () => {
    vi.mocked(requestShareMessages).mockResolvedValue({
      general: null,
      personal,
      questions: [],
      status: "written",
    });

    renderEditor();

    fireEvent.change(screen.getByLabelText(/Describe it and let Tala write it/), {
      target: { value: "warm but short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write with Tala" }));

    // The placeholders are filled in for the preview, which is where a creator judges it —
    // rather than being quoted back as a template inside the conversation.
    // `{recipient}`, `{celebrant}`, and `{occasion}` are all filled in. Both previews name the
    // invitation, so the recipient is what proves this is the personal one.
    await waitFor(() => expect(screen.getByText(/Hi, Ninang Anika/)).toBeTruthy());
    expect(screen.getByText(/Hi, Ninang Anika/).textContent).toContain("Mara & Joaquin's wedding");
  });

  it("carries the wording on screen into a follow-up", async () => {
    vi.mocked(requestShareMessages).mockResolvedValue({
      general: null,
      personal,
      questions: [],
      status: "written",
    });

    renderEditor();

    fireEvent.change(screen.getByLabelText(/Describe it and let Tala write it/), {
      target: { value: "warm but short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write with Tala" }));
    await waitFor(() => expect(personalField().value).toBe(personal));

    // The creator edits it themselves before asking for a change. Without the record below,
    // Tala would be shortening its own last answer and this edit would be lost.
    fireEvent.change(personalField(), { target: { value: `${personal} See you there!` } });

    fireEvent.change(screen.getByLabelText(/Tell Tala what to change/), {
      target: { value: "shorter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to Tala" }));

    await waitFor(() => expect(requestShareMessages).toHaveBeenCalledTimes(2));
    const sent = vi.mocked(requestShareMessages).mock.calls[1]?.[1] ?? [];
    const record = sent.find((entry) => entry.content.startsWith("[Invitica —"));
    expect(record?.content).toContain("See you there!");
    expect(sent.at(-1)).toEqual({ content: "shorter", role: "user" });
  });

  it("asks rather than guessing when the request has nothing in it", async () => {
    vi.mocked(requestShareMessages).mockResolvedValue({
      questions: ["How formal should it sound?", "Should it mention the reception?"],
      status: "questions",
    });

    renderEditor();

    fireEvent.change(screen.getByLabelText(/Describe it and let Tala write it/), {
      target: { value: "write my message" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write with Tala" }));

    await waitFor(() => expect(screen.getByText(/How formal should it sound\?/)).toBeTruthy());
    // Nothing was written, so nothing in the fields changed.
    expect(personalField().value).toBe("");
    expect(generalField().value).toBe("");
  });

  it("leaves a message Tala did not touch alone", async () => {
    vi.mocked(requestShareMessages).mockResolvedValue({
      general: null,
      personal,
      questions: [],
      status: "written",
    });

    renderEditor({ stored: { generalShareMessage: general } });

    fireEvent.change(screen.getByLabelText(/Tell Tala what to change/), {
      target: { value: "rewrite just the personal one" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to Tala" }));

    await waitFor(() => expect(personalField().value).toBe(personal));
    expect(generalField().value).toBe(general);
  });

  it("reports a refusal and keeps every field as it was", async () => {
    vi.mocked(requestShareMessages).mockResolvedValue({
      message: "You have used all of today's messages with Tala. They refresh tomorrow.",
      status: "refused",
    });

    renderEditor({ stored: { personalShareMessage: personal } });

    fireEvent.change(screen.getByLabelText(/Tell Tala what to change/), {
      target: { value: "shorter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to Tala" }));

    // Beside the box it was typed into rather than at the foot of the dialog, and Try again
    // hands the creator back the words that failed instead of leaving them nowhere.
    await waitFor(() => expect(screen.getByText(/today's messages/)).toBeTruthy());
    expect(personalField().value).toBe(personal);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect((screen.getByLabelText(/Tell Tala what to change/) as HTMLTextAreaElement).value).toBe(
      "shorter",
    );
  });

  it("offers examples that fill the box rather than spending a message", () => {
    renderEditor();

    const example = screen.getByRole("button", {
      name: "Warm but short, and call them by their nickname",
    });
    fireEvent.click(example);

    // Filling, not sending. One tap used to spend a message from a twenty-message day on a
    // request the creator had not finished reading.
    expect(requestShareMessages).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText(/Describe it and let Tala write it/) as HTMLTextAreaElement).value,
    ).toBe("Warm but short, and call them by their nickname");
  });

  it("sends on Enter and breaks the line on Shift+Enter", async () => {
    vi.mocked(requestShareMessages).mockResolvedValue({
      general: null,
      personal,
      questions: [],
      status: "written",
    });

    renderEditor();

    const box = screen.getByLabelText(/Describe it and let Tala write it/);
    fireEvent.change(box, { target: { value: "warm but short" } });

    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(requestShareMessages).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(requestShareMessages).toHaveBeenCalledTimes(1));
  });

  it("says which message moved when only one of them did", async () => {
    vi.mocked(requestShareMessages).mockResolvedValue({
      general: null,
      personal,
      questions: [],
      status: "written",
    });

    renderEditor({ stored: { generalShareMessage: general } });

    fireEvent.change(screen.getByLabelText(/Tell Tala what to change/), {
      target: { value: "rewrite just the personal one" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to Tala" }));

    await waitFor(() => expect(screen.getByText(/Your general message is unchanged/)).toBeTruthy());
  });

  it("offers no general wording on a Romance invitation, which has no field for it", async () => {
    vi.mocked(requestShareMessages).mockResolvedValue({
      general,
      personal,
      questions: [],
      status: "written",
    });

    renderEditor({ personalOnly: true });

    fireEvent.change(screen.getByLabelText(/Describe it and let Tala write it/), {
      target: { value: "warm and private" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write with Tala" }));

    await waitFor(() => expect(personalField().value).toBe(personal));
    expect(screen.queryByLabelText("General message, for sharing with everyone")).toBeNull();
  });

  it("is not offered at all when the assistant is switched off", () => {
    renderEditor({ assistantAvailable: false });

    expect(screen.queryByRole("button", { name: "Write with Tala" })).toBeNull();
    // Every other part of the editor is unchanged by that flag.
    expect(personalField()).toBeTruthy();
    expect(generalField()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save message" })).toBeTruthy();
  });

  it("keeps its controls inside the dialog's own focus trap", () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText(/Describe it and let Tala write it/), {
      target: { value: "warm but short" },
    });

    // The trap walks this exact selector, so being matched by it is what makes the request box
    // keyboard-reachable rather than a mouse-only shortcut past the fields.
    const focusable = Array.from(
      screen
        .getByRole("dialog")
        .querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled])"),
    );

    expect(focusable).toContain(screen.getByLabelText(/Describe it and let Tala write it/));
    expect(focusable).toContain(screen.getByRole("button", { name: "Write with Tala" }));
  });

  it("holds the dialog shut while an answer that has already been billed is in flight", async () => {
    let settle: (value: {
      general: null;
      personal: string;
      questions: string[];
      status: "written";
    }) => void = () => undefined;
    vi.mocked(requestShareMessages).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    renderEditor();

    fireEvent.change(screen.getByLabelText(/Describe it and let Tala write it/), {
      target: { value: "warm but short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write with Tala" }));

    // The wait names the work rather than the control, so the dialog says what Tala is doing
    // instead of only greying out.
    await waitFor(() => expect(screen.getByText("Tala is writing your message")).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    settle({ general: null, personal, questions: [], status: "written" });
    await waitFor(() => expect(personalField().value).toBe(personal));

    // There is wording on screen now, so Escape asks before throwing it away.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("closing the invitation message editor with work in it", () => {
  it("closes straight away when nothing has been touched", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("heading", { name: "Discard this message?" })).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding wording the creator typed, and keeps it when they say so", () => {
    renderEditor();

    fireEvent.change(personalField(), { target: { value: personal } });
    fireEvent.click(screen.getByRole("button", { name: "Close invitation message editor" }));

    expect(screen.getByRole("heading", { name: "Discard this message?" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("heading", { name: "Discard this message?" })).toBeNull();
    expect(personalField().value).toBe(personal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("treats Escape inside the question as Keep editing, never as Discard", () => {
    renderEditor();

    fireEvent.change(personalField(), { target: { value: personal } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Discard this message?" })).toBeTruthy();

    // A creator who presses Escape twice by reflex must not find the second press threw
    // their message away.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Discard this message?" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(personalField().value).toBe(personal);
  });

  it("does not ask when the fields still hold exactly what was saved", () => {
    renderEditor({ stored: { generalShareMessage: general, personalShareMessage: personal } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks about a conversation with Tala even when no field changed", async () => {
    vi.mocked(requestShareMessages).mockResolvedValue({
      questions: ["How formal should it sound?"],
      status: "questions",
    });

    renderEditor();

    fireEvent.change(screen.getByLabelText(/Describe it and let Tala write it/), {
      target: { value: "write my message" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write with Tala" }));
    await waitFor(() => expect(screen.getByText(/How formal should it sound\?/)).toBeTruthy());

    // Nothing was written into a field, but a message was spent and questions are on screen.
    expect(personalField().value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Discard this message?" })).toBeTruthy();
  });
});
