import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssistantConversationSummary } from "../src/contracts/assistant-api";

const listConversations = vi.fn(async (): Promise<AssistantConversationSummary[]> => []);

// The provider reaches history through server actions. Stubbing the module keeps these cases
// about what the composer offers rather than about Supabase.
vi.mock("../src/server/assistant/actions", () => ({
  deleteAssistantConversationAction: async () => undefined,
  listAssistantConversationsAction: () => listConversations(),
  loadAssistantConversationAction: async () => null,
  readAssistantUsageAction: async () => null,
  saveAssistantConversationAction: async () => null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/invitations/abc",
  useRouter: () => ({ push: vi.fn() }),
}));

const { AssistantConversation } = await import("../src/components/assistant/AssistantConversation");
const { AssistantProvider, useAssistant } = await import(
  "../src/components/assistant/AssistantProvider"
);

const invitationId = "a1000000-0000-4000-8000-000000000001";

/**
 * Stands in for whichever surface put an invitation in Invi's context.
 *
 * The abilities are the point: the editor, the Guest Desk, and the assistant page each state a
 * different pair, and what the composer may offer follows from them.
 */
function Selects({ canDraft, canOrganize }: { canDraft: boolean; canOrganize: boolean }) {
  const { setInvitationId } = useAssistant();

  useEffect(() => {
    setInvitationId(invitationId, { canDraft, canOrganize });
  }, [canDraft, canOrganize, setInvitationId]);

  return null;
}

function renderComposer(abilities: { canDraft: boolean; canOrganize: boolean }) {
  return render(
    <AssistantProvider>
      <Selects {...abilities} />
      <AssistantConversation />
    </AssistantProvider>,
  );
}

function type(text: string) {
  fireEvent.change(
    screen.getByLabelText(/^(Ask Invi|Describe your event|Paste your guest list)$/),
    {
      target: { value: text },
    },
  );
}

beforeEach(() => {
  listConversations.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("offering the right tab before a message is spent", () => {
  it("offers to draft when a creator types a content change into the question tab", () => {
    renderComposer({ canDraft: true, canOrganize: true });
    type("change the reception time to 6pm");

    expect(screen.getByText("That reads like a change to your invitation.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch to Draft my invitation" })).toBeTruthy();
  });

  it("switches the tab and keeps what was typed", () => {
    // The creator wrote the message, so the creator still sends it. Losing their words to a
    // suggestion they accepted would be a worse trade than never offering it.
    renderComposer({ canDraft: true, canOrganize: true });
    type("change the reception time to 6pm");

    fireEvent.click(screen.getByRole("button", { name: "Switch to Draft my invitation" }));

    const composer = screen.getByLabelText("Describe your event") as HTMLTextAreaElement;
    expect(composer.value).toBe("change the reception time to 6pm");
    expect(
      screen.getByRole("button", { name: "Draft my invitation" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("nothing is sent by accepting a suggestion", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderComposer({ canDraft: true, canOrganize: true });
    type("change the reception time to 6pm");
    fireEvent.click(screen.getByRole("button", { name: "Switch to Draft my invitation" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("takes no for an answer and does not raise the same tab again", () => {
    renderComposer({ canDraft: true, canOrganize: true });
    type("change the reception time to 6pm");

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("button", { name: "Switch to Draft my invitation" })).toBeNull();

    // Still dismissed as the same sentence grows, rather than reappearing on the next keystroke.
    type("change the reception time to 6pm and the venue");
    expect(screen.queryByRole("button", { name: "Switch to Draft my invitation" })).toBeNull();
  });

  it("still offers a different tab after one has been dismissed", () => {
    renderComposer({ canDraft: true, canOrganize: true });
    type("change the reception time to 6pm");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    type("Tita Baby +2, Ninong Ramon");
    expect(screen.getByRole("button", { name: "Switch to Organize my guest list" })).toBeTruthy();
  });

  it("never offers a tab this invitation cannot use", () => {
    // An unpublished invitation has no guest list, and the guest route refuses one with a 404.
    renderComposer({ canDraft: true, canOrganize: false });
    type("Tita Baby +2, Ninong Ramon");

    expect(screen.queryByRole("button", { name: "Switch to Organize my guest list" })).toBeNull();
  });

  it("says nothing about a question asked in the question tab", () => {
    renderComposer({ canDraft: true, canOrganize: true });
    type("How do I send personalized links?");

    expect(screen.queryByText(/^That reads like/)).toBeNull();
  });

  it("offers the question tab to a creator asking how Invitica works while drafting", () => {
    renderComposer({ canDraft: true, canOrganize: true });
    fireEvent.click(screen.getByRole("button", { name: "Draft my invitation" }));

    type("how do I publish this?");

    expect(screen.getByRole("button", { name: "Switch to Answer a question" })).toBeTruthy();
  });
});
