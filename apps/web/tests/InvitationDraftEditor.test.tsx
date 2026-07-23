import { resolveTemplateById } from "@invitica/template-kit";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvitationDraftEditor } from "../src/components/invitations/InvitationDraftEditor";
import { saveGardenPromiseAction } from "../src/server/invitations/actions";

vi.mock("../src/server/invitations/actions", () => ({
  loadInvitationPublicationStatusAction: vi.fn(),
  publishInvitationAction: vi.fn(),
  saveGardenPromiseAction: vi.fn(),
}));

const invitationId = "71000000-0000-4000-8000-000000000001";
const nextInvitationId = "71000000-0000-4000-8000-000000000002";
const gardenPromise = resolveTemplateById("garden-promise");

function renderEditor() {
  return render(
    <InvitationDraftEditor
      initialDocument={gardenPromise.defaultDocument}
      initialRevision={1}
      invitationId={invitationId}
      rendererKey={gardenPromise.rendererKey}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(saveGardenPromiseAction).mockReset();
});

describe("invitation draft editor", () => {
  it("updates the real preview immediately and saves after the idle delay", async () => {
    vi.mocked(saveGardenPromiseAction).mockResolvedValue({ revision: 2, status: "saved" });
    const { container } = renderEditor();

    fireEvent.change(screen.getByLabelText(/Names or invitation title/), {
      target: { value: "Lira & Mateo" },
    });

    expect(container.querySelector("[data-envelope-gated] h1")?.textContent).toBe("Lira & Mateo");
    expect(screen.getByText("Unsaved changes")).toBeDefined();
    expect(saveGardenPromiseAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(saveGardenPromiseAction).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        invitationId,
        title: "Lira & Mateo",
      }),
    );
    expect(screen.getByText("Revision 2")).toBeDefined();
  });

  it("keeps local text visible and offers recovery after a revision conflict", async () => {
    vi.mocked(saveGardenPromiseAction).mockResolvedValue({
      message: "This draft changed in another session.",
      status: "conflict",
    });
    const { container } = renderEditor();

    fireEvent.change(screen.getByLabelText(/Names or invitation title/), {
      target: { value: "A local version" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(container.querySelector("[data-envelope-gated] h1")?.textContent).toBe(
      "A local version",
    );
    expect(screen.getByRole("alert").textContent).toContain("local text remains visible");
    expect(screen.getByRole("button", { name: "Copy unsaved details" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Discard and reload" })).toBeDefined();
  });

  it("updates venue and RSVP details in the shared preview", () => {
    const { container } = renderEditor();

    fireEvent.change(screen.getByLabelText(/Venue name/), {
      target: { value: "The Glass Garden" },
    });
    fireEvent.change(screen.getByLabelText(/RSVP message/), {
      target: { value: "Please celebrate with us." },
    });
    fireEvent.change(screen.getByLabelText(/RSVP deadline/), {
      target: { value: "2027-02-01" },
    });

    expect(container.querySelector(".gp-venue h3")?.textContent).toBe("The Glass Garden");
    expect(container.querySelector(".gp-rsvp > p")?.textContent).toBe("Please celebrate with us.");
    expect(container.querySelector(".gp-rsvp time")?.textContent).toContain("February 1, 2027");
  });

  it("blocks saving an unsafe map link", async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText(/Map link/), {
      target: { value: "javascript:alert('unsafe')" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(screen.getByText("Use a complete http:// or https:// link.")).toBeDefined();
    expect(saveGardenPromiseAction).not.toHaveBeenCalled();
  });

  it("recovers when a save request rejects", async () => {
    vi.mocked(saveGardenPromiseAction)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ revision: 2, status: "saved" });
    const { container } = renderEditor();
    fireEvent.change(screen.getByLabelText(/Names or invitation title/), {
      target: { value: "A resilient local draft" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(screen.getByText("Save failed")).toBeDefined();
    expect(container.querySelector("[data-envelope-gated] h1")?.textContent).toBe(
      "A resilient local draft",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(screen.getByText("Revision 2")).toBeDefined();
  });

  it("uses a familiar mobile segmented control for editing and previewing", () => {
    renderEditor();

    const editButton = screen.getByRole("button", { name: "Edit details" });
    const previewButton = screen.getByRole("button", { name: "Preview invitation" });
    expect(editButton.getAttribute("aria-pressed")).toBe("true");
    expect(previewButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(previewButton);

    expect(editButton.getAttribute("aria-pressed")).toBe("false");
    expect(previewButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("resets publication state when navigating to another invitation", () => {
    const { rerender } = render(
      <InvitationDraftEditor
        initialDocument={gardenPromise.defaultDocument}
        initialPublication={{
          errorCode: null,
          livePublicIdentifier: null,
          publicationId: "92000000-0000-4000-8000-000000000001",
          publishedRevision: 1,
          status: "publishing",
        }}
        initialRevision={1}
        invitationId={invitationId}
        rendererKey={gardenPromise.rendererKey}
      />,
    );
    expect(screen.getByRole("button", { name: /Publishing/ })).toBeDefined();

    rerender(
      <InvitationDraftEditor
        initialDocument={gardenPromise.defaultDocument}
        initialPublication={{
          errorCode: null,
          livePublicIdentifier: null,
          publicationId: null,
          publishedRevision: null,
          status: "idle",
        }}
        initialRevision={1}
        invitationId={nextInvitationId}
        rendererKey={gardenPromise.rendererKey}
      />,
    );

    expect(screen.getByRole("button", { name: "Publish invitation" })).toBeDefined();
  });
});
