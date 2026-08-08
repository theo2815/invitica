import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteAssistantConversations: vi.fn(async () => ({ error: null, notice: "Deleted." })),
  requestAccountDeletion: vi.fn(async () => ({ error: null, notice: "Check your inbox." })),
  signOutEverywhere: vi.fn(async () => undefined),
}));

vi.mock("../src/server/account/actions", () => ({
  changeEmailAddress: vi.fn(),
  changePassword: vi.fn(),
  deleteAssistantConversations: mocks.deleteAssistantConversations,
  requestAccountDeletion: mocks.requestAccountDeletion,
  setThemePreference: vi.fn(),
  signOutEverywhere: mocks.signOutEverywhere,
  updateCreatorName: vi.fn(),
}));

import { AssistantDataPanel } from "../src/components/settings/AssistantDataPanel";
import { DeleteAccountPanel } from "../src/components/settings/DeleteAccountPanel";
import { SettingsSection, SettingsStatus } from "../src/components/settings/SettingsSection";
import { SignOutEverywhere } from "../src/components/settings/SignOutEverywhere";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("settings section structure", () => {
  it("gives every group a heading below the page title", () => {
    render(
      <SettingsSection description="What this does." title="Password">
        <p>body</p>
      </SettingsSection>,
    );

    // h2, not h3 or a styled div: the page owns the single h1 and these are its peers.
    expect(screen.getByRole("heading", { level: 2, name: "Password" })).toBeDefined();
  });

  /**
   * `--danger` and `--accent` are both warm and both pass contrast, which makes them poor at
   * separating a success from a failure on their own. Every status carries a mark as well.
   */
  it("pairs a status with a mark rather than relying on color", () => {
    const { container, rerender } = render(<SettingsStatus message="Saved." tone="success" />);
    const success = screen.getByRole("status");
    expect(success.dataset.tone).toBe("success");
    expect(container.querySelector("svg")).not.toBeNull();

    rerender(<SettingsStatus message="Failed." tone="danger" />);
    expect(screen.getByRole("status").dataset.tone).toBe("danger");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("consequential actions ask first", () => {
  it("does not sign out until the dialog is confirmed", async () => {
    render(<SignOutEverywhere />);
    fireEvent.click(screen.getByRole("button", { name: /Sign out everywhere/ }));

    const dialog = screen.getByRole("dialog");
    // The safe answer holds focus, so Enter by reflex keeps the session.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole("button", { name: "Stay signed in" }),
      ),
    );
    expect(mocks.signOutEverywhere).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));
    await waitFor(() => expect(mocks.signOutEverywhere).toHaveBeenCalledOnce());
  });

  it("keeps saved conversations when the dialog is dismissed with Escape", async () => {
    render(<AssistantDataPanel savedConversations={3} usage={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Delete all conversations/ }));
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.deleteAssistantConversations).not.toHaveBeenCalled();
  });

  it("says the allowance is unavailable rather than showing zero", () => {
    render(<AssistantDataPanel savedConversations={0} usage={null} />);

    expect(screen.getByText(/count is unavailable/)).toBeDefined();
    // Nothing to delete, so nothing offers to.
    expect(screen.queryByRole("button", { name: /Delete all conversations/ })).toBeNull();
  });

  it("reports the allowance clamped to the cap", () => {
    render(
      <AssistantDataPanel
        savedConversations={1}
        usage={{ dailyLimit: 20, resetsAt: "2026-08-08T16:00:00.000Z", used: 24 }}
      />,
    );

    expect(screen.getByText("20 of 20 messages used today.")).toBeDefined();
  });
});

describe("the account deletion warning", () => {
  /**
   * "This cannot be undone" is true of many things. What a creator cannot discover afterwards is
   * that their shared links stop opening, so the warning counts them.
   */
  it("names the published invitations that stop opening for guests", () => {
    render(<DeleteAccountPanel invitationCount={5} publishedCount={3} />);

    expect(screen.getByText(/all 5 of your invitations/)).toBeDefined();
    expect(screen.getByText(/3 invitations you have published stop/)).toBeDefined();
  });

  it("reads correctly for a single published invitation", () => {
    render(<DeleteAccountPanel invitationCount={1} publishedCount={1} />);

    expect(screen.getByText(/your invitation,/)).toBeDefined();
    expect(screen.getByText(/invitation you have published stops/)).toBeDefined();
  });

  it("emails the link only after the dialog is confirmed", async () => {
    render(<DeleteAccountPanel invitationCount={2} publishedCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Delete my account/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/nothing is deleted until you follow it/i)).toBeDefined();
    expect(mocks.requestAccountDeletion).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, email me the link" }));
    await waitFor(() => expect(mocks.requestAccountDeletion).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toBeDefined();
  });
});
