import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AssistantApiMessage,
  AssistantConversationSummary,
} from "../src/contracts/assistant-api";

interface SavedConversation {
  messages: AssistantApiMessage[];
}

const listConversations = vi.fn(async (): Promise<AssistantConversationSummary[]> => []);
const saveConversation = vi.fn(async (_input: unknown): Promise<null | string> => null);

vi.mock("../src/server/assistant/actions", () => ({
  deleteAssistantConversationAction: async () => undefined,
  listAssistantConversationsAction: () => listConversations(),
  loadAssistantConversationAction: async () => null,
  readAssistantUsageAction: async () => null,
  saveAssistantConversationAction: (input: unknown) => saveConversation(input),
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
 * Guided drafting from the creator's side of the wire.
 *
 * The route's own decisions are covered in `AssistantDocumentRoute.test.ts`. What these cases
 * hold is the half that decides whether the feature is usable at all: a batch of questions has
 * to arrive as an ordinary message the creator can answer in the composer they are already
 * typing in, and asking must not stage a draft — there is no draft when nothing was drafted.
 */
function Drafting() {
  const { setInvitationId, setMode } = useAssistant();

  useEffect(() => {
    setInvitationId(invitationId, { canDraft: true, canOrganize: false });
    setMode("document");
  }, [setInvitationId, setMode]);

  return null;
}

/** Reads the staged proposal out of the shell, which is where the editor would find one. */
function ProposalProbe() {
  const { proposal } = useAssistant();
  return <span data-testid="proposal">{proposal ? "staged" : "none"}</span>;
}

function renderDrafting() {
  return render(
    <AssistantProvider>
      <Drafting />
      <ProposalProbe />
      <AssistantConversation />
    </AssistantProvider>,
  );
}

function answerWith(body: unknown) {
  const fetchMock = vi.fn(async () =>
    Response.json(body, { headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function send(text: string) {
  fireEvent.change(screen.getByLabelText("Describe your event"), { target: { value: text } });
  // The composer's action is labelled per mode; in drafting it reads Draft.
  fireEvent.click(screen.getByRole("button", { name: "Draft" }));
}

beforeEach(() => {
  listConversations.mockClear();
  saveConversation.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("being asked before being drafted for", () => {
  it("puts a batch of questions in the thread as an ordinary answer", async () => {
    answerWith({
      questions: ["Who is being christened?", "What date?", "Which church?"],
      status: "questions",
    });
    renderDrafting();

    send("help me with my invitation");

    await screen.findByText(/Before I draft anything, 3 things:/);
    // Numbered, so the creator can answer two of the three and say which.
    expect(screen.getByText(/Who is being christened\?/)).toBeTruthy();
    expect(screen.getByText(/Which church\?/)).toBeTruthy();
  });

  it("stages no draft when there was nothing to draft", async () => {
    answerWith({ questions: ["What date?", "Where?", "Who is hosting?"], status: "questions" });
    renderDrafting();

    send("help me");

    await screen.findByText(/Before I draft anything/);
    // A proposal panel offering to keep changes that were never made is the worst outcome
    // available here — the creator would apply an unchanged document over their own work.
    expect(screen.getByTestId("proposal").textContent).toBe("none");
  });

  it("keeps the questions in the saved thread, so answering them survives a reload", async () => {
    answerWith({ questions: ["What date?"], status: "questions" });
    renderDrafting();

    send("help me");

    await screen.findByText(/Before I draft anything/);
    await waitFor(() => expect(saveConversation).toHaveBeenCalled());

    const saved = saveConversation.mock.calls.at(-1)?.[0] as SavedConversation;
    expect(saved.messages.at(-1)?.role).toBe("assistant");
    expect(saved.messages.at(-1)?.content).toContain("What date?");
  });

  it("shows the draft first and the remaining questions under it", async () => {
    answerWith({
      details: {},
      document: { assets: [], sections: [], templateId: "little-blessings", version: 1 },
      questions: ["What date is the christening?"],
      revision: 3,
      status: "proposed",
    });
    renderDrafting();

    send("It is for Amihan");

    // Rendered as separate paragraphs by the bounded Markdown reader, so the order is asserted
    // across the answer rather than inside one node.
    const drafted = await screen.findByText(/I have drafted this into your invitation/);
    const asked = screen.getByText(/To finish the rest, one thing:/);

    expect(drafted.compareDocumentPosition(asked)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText(/What date is the christening\?/)).toBeTruthy();
    expect(screen.getByTestId("proposal").textContent).toBe("staged");
  });

  it("says exactly what it always said when nothing is missing", async () => {
    answerWith({
      details: {},
      document: { assets: [], sections: [], templateId: "little-blessings", version: 1 },
      questions: [],
      revision: 3,
      status: "proposed",
    });
    renderDrafting();

    send("Her name is Amihan, on 12 March 2027 at San Agustin");

    await screen.findByText(/I have drafted this into your invitation/);
    expect(screen.queryByText(/To finish the rest/)).toBeNull();
  });

  it("still reports a refusal as a notice rather than as an answer", async () => {
    answerWith({
      message: "I could not tell which part of the invitation to change.",
      status: "refused",
    });
    renderDrafting();

    send("thanks, that's all");

    await screen.findByText(/I could not tell which part of the invitation to change\./);
    expect(screen.getByTestId("proposal").textContent).toBe("none");
  });
});
