import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvitationPublicationPanel } from "../src/components/invitations/InvitationPublicationPanel";
import {
  loadInvitationPublicationStatusAction,
  publishInvitationAction,
} from "../src/server/invitations/actions";
import type { InvitationPublicationStatus } from "../src/server/invitations/publications";

vi.mock("../src/server/invitations/actions", () => ({
  loadInvitationPublicationStatusAction: vi.fn(),
  publishInvitationAction: vi.fn(),
}));

const invitationId = "71000000-0000-4000-8000-000000000001";
const publicationId = "92000000-0000-4000-8000-000000000001";
const idle = {
  errorCode: null,
  livePublicIdentifier: null,
  publicationId: null,
  publishedRevision: null,
  status: "idle",
} as const;

function renderPanel(initialPublication: InvitationPublicationStatus = idle) {
  return render(
    <InvitationPublicationPanel
      assetsReady
      canPublish
      detailsReady
      draftReady
      initialPublication={initialPublication}
      invitationId={invitationId}
      revision={4}
      titleReady
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

beforeEach(() => {
  vi.mocked(loadInvitationPublicationStatusAction).mockReset();
  vi.mocked(publishInvitationAction).mockReset();
});

describe("invitation publication panel", () => {
  it("supports confirmation, Escape, and focus return", () => {
    renderPanel();
    const publishButton = screen.getByRole("button", { name: "Publish invitation" });
    fireEvent.click(publishButton);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(publishButton);
    expect(publishInvitationAction).not.toHaveBeenCalled();
  });

  it("starts the saved revision but withholds the guest link while pending", async () => {
    vi.mocked(publishInvitationAction).mockResolvedValue({ publicationId, status: "accepted" });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Publish invitation" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Publishing/ })).toBeDefined());
    expect(publishInvitationAction).toHaveBeenCalledWith({
      expectedRevision: 4,
      idempotencyKey: expect.any(String),
      invitationId,
    });
    expect(screen.queryByRole("link", { name: "Go to Guests & RSVPs" })).toBeNull();
  });

  it("recovers when the publication request rejects", async () => {
    vi.mocked(publishInvitationAction).mockRejectedValue(new Error("offline"));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Publish invitation" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));

    await waitFor(() =>
      expect(screen.getByText(/Publishing could not start/).getAttribute("role")).toBe("alert"),
    );
    expect(screen.getByRole("button", { name: "Publish invitation" })).toBeDefined();
  });

  it("pauses status polling while hidden and resumes when visible", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    vi.mocked(loadInvitationPublicationStatusAction).mockResolvedValue({
      publication: {
        errorCode: null,
        livePublicIdentifier: "0123456789abcdef0123456789abcdef",
        publicationId,
        publishedRevision: 4,
        status: "delivered",
      },
      status: "loaded",
    });
    renderPanel({
      errorCode: null,
      livePublicIdentifier: null,
      publicationId,
      publishedRevision: 4,
      status: "publishing",
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(loadInvitationPublicationStatusAction).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(2_000);

    expect(loadInvitationPublicationStatusAction).toHaveBeenCalledTimes(1);
  });

  it("bounds repeated publication status failures", async () => {
    vi.useFakeTimers();
    vi.mocked(loadInvitationPublicationStatusAction).mockResolvedValue({
      message: "Status unavailable.",
      status: "error",
    });
    renderPanel({
      errorCode: null,
      livePublicIdentifier: null,
      publicationId,
      publishedRevision: 4,
      status: "publishing",
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(loadInvitationPublicationStatusAction).toHaveBeenCalledTimes(30);
    expect(screen.getByText(/Publishing is taking longer than expected/)).toBeDefined();
  });

  it("moves confirmed publications to the guest desk without exposing a share link", () => {
    renderPanel({
      errorCode: null,
      livePublicIdentifier: "0123456789abcdef0123456789abcdef",
      publicationId,
      publishedRevision: 4,
      status: "delivered",
    });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open invitation" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to Guests & RSVPs" }).getAttribute("href")).toBe(
      `/dashboard/guests?invitationId=${invitationId}`,
    );
    expect(screen.getByRole("button", { name: "Published" }).hasAttribute("disabled")).toBe(true);
  });
});
