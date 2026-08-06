import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/server/assistant/actions", () => ({
  deleteAssistantConversationAction: async () => undefined,
  listAssistantConversationsAction: async () => [],
  loadAssistantConversationAction: async () => null,
  readAssistantUsageAction: async () => null,
  saveAssistantConversationAction: async () => null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/guests",
  useRouter: () => ({ push: vi.fn() }),
}));

const { AssistantProvider, useAssistant } = await import(
  "../src/components/assistant/AssistantProvider"
);
const { AssistantConversation } = await import("../src/components/assistant/AssistantConversation");

const invitationId = "d4000000-0000-4000-8000-000000000001";

/** Stands in for the editor and the Guest Desk, which are what put an invitation in context. */
function Surface({ canDraft, canOrganize }: { canDraft: boolean; canOrganize: boolean }) {
  const { setInvitationId } = useAssistant();

  return (
    <>
      <button
        onClick={() => setInvitationId(invitationId, { canDraft, canOrganize })}
        type="button"
      >
        open invitation
      </button>
      <button onClick={() => setInvitationId(null)} type="button">
        leave invitation
      </button>
    </>
  );
}

function renderPanel(abilities: { canDraft: boolean; canOrganize: boolean }) {
  return render(
    <AssistantProvider>
      <Surface {...abilities} />
      <AssistantConversation />
    </AssistantProvider>,
  );
}

const DRAFT_TAB = "Draft my invitation";
const GUESTS_TAB = "Organize my guest list";

afterEach(() => {
  cleanup();
});

/**
 * Which of Tala's three jobs a surface can actually do, and how it says so.
 *
 * The switch used to be hidden entirely until an invitation was in context, which meant a
 * creator on Overview, Templates, or Invitations saw no evidence that Tala did anything but
 * answer questions. It is now always on screen with the unavailable tabs disabled and a line
 * saying what unlocks them.
 *
 * The second half of this file guards a defect that hiding it concealed: mode survived
 * navigation while the invitation did not, so a creator who left the Guest Desk in organizing
 * mode arrived elsewhere with the composer still labelled "Paste your guest list" while the
 * message went to the help endpoint.
 */
describe("which modes a surface offers", () => {
  it("shows all three even where none of the invitation ones can run", () => {
    renderPanel({ canDraft: false, canOrganize: false });

    expect(screen.getByRole("button", { name: "Answer a question" })).toBeTruthy();
    expect(screen.getByRole("button", { name: DRAFT_TAB })).toBeTruthy();
    expect(screen.getByRole("button", { name: GUESTS_TAB })).toBeTruthy();
  });

  it("disables the ones that would refuse, and says what they need", () => {
    renderPanel({ canDraft: false, canOrganize: false });

    expect(screen.getByRole("button", { name: DRAFT_TAB })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: GUESTS_TAB })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Open an invitation to draft or organize/)).toBeTruthy();
  });

  it("names the one thing that is missing when only one is", () => {
    renderPanel({ canDraft: true, canOrganize: false });
    fireEvent.click(screen.getByRole("button", { name: "open invitation" }));

    expect(screen.getByRole("button", { name: DRAFT_TAB })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: GUESTS_TAB })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Organizing needs a published invitation/)).toBeTruthy();
  });

  it("says nothing when every mode is available", () => {
    renderPanel({ canDraft: true, canOrganize: true });
    fireEvent.click(screen.getByRole("button", { name: "open invitation" }));

    expect(screen.getByRole("button", { name: DRAFT_TAB })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: GUESTS_TAB })).toHaveProperty("disabled", false);
    expect(screen.queryByText(/Organizing needs a published invitation/)).toBeNull();
    expect(screen.queryByText(/Open an invitation to draft or organize/)).toBeNull();
  });
});

describe("a mode whose invitation goes away", () => {
  it("falls back to answering rather than leaving the composer asking for a guest list", () => {
    renderPanel({ canDraft: true, canOrganize: true });
    fireEvent.click(screen.getByRole("button", { name: "open invitation" }));

    fireEvent.click(screen.getByRole("button", { name: GUESTS_TAB }));
    expect(screen.getByRole("textbox", { name: "Paste your guest list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Organize" })).toBeTruthy();

    // What leaving the Guest Desk does. The invitation is released; the mode used to stay.
    fireEvent.click(screen.getByRole("button", { name: "leave invitation" }));

    expect(screen.getByRole("textbox", { name: "Ask Tala" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Paste your guest list" })).toBeNull();
  });

  it("falls back when the next surface can no longer do it, not only when there is none", () => {
    const view = renderPanel({ canDraft: true, canOrganize: true });
    fireEvent.click(screen.getByRole("button", { name: "open invitation" }));
    fireEvent.click(screen.getByRole("button", { name: DRAFT_TAB }));
    expect(screen.getByRole("textbox", { name: "Describe your event" })).toBeTruthy();

    // The Guest Desk: an invitation, but no surface on that route that can apply a draft.
    view.rerender(
      <AssistantProvider>
        <Surface canDraft={false} canOrganize={true} />
        <AssistantConversation />
      </AssistantProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "open invitation" }));

    expect(screen.queryByRole("textbox", { name: "Describe your event" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Ask Tala" })).toBeTruthy();
  });
});
