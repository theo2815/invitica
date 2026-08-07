import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AssistantApiMessage,
  AssistantConversationSummary,
} from "../src/contracts/assistant-api";

interface SavedConversation {
  conversationId: null | string;
  messages: AssistantApiMessage[];
  title: string;
}

const deleteConversation = vi.fn(async (_input: unknown): Promise<void> => undefined);
const listConversations = vi.fn(async (): Promise<AssistantConversationSummary[]> => []);
const loadConversation = vi.fn(
  async (_input: unknown): Promise<AssistantApiMessage[] | null> => null,
);
const saveConversation = vi.fn(
  async (_input: unknown): Promise<null | string> => "11111111-1111-4111-8111-111111111111",
);

// The provider reaches history through server actions. Stubbing the module keeps these
// cases about the thread's own behaviour rather than about Supabase.
vi.mock("../src/server/assistant/actions", () => ({
  deleteAssistantConversationAction: (input: unknown) => deleteConversation(input),
  listAssistantConversationsAction: () => listConversations(),
  loadAssistantConversationAction: (input: unknown) => loadConversation(input),
  readAssistantUsageAction: async () => null,
  saveAssistantConversationAction: (input: unknown) => saveConversation(input),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

const { AssistantConversation } = await import("../src/components/assistant/AssistantConversation");
const { AssistantProvider } = await import("../src/components/assistant/AssistantProvider");

/**
 * A stream the test controls: it emits on demand, never ends on its own, and fails the
 * way a real fetch body fails when the request is aborted. That last part is the point —
 * `AbortController` reaches the provider through the body reader, not through the promise
 * that already resolved with the response.
 */
function controllableAnswer() {
  let stream: null | ReadableStreamDefaultController<Uint8Array> = null;

  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        stream = controller;
      },
    }),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );

  return {
    fetch: vi.fn(async (_url: string, init?: RequestInit) => {
      init?.signal?.addEventListener("abort", () => {
        stream?.error(new DOMException("Aborted", "AbortError"));
      });
      return response;
    }),
    push: (text: string) => stream?.enqueue(new TextEncoder().encode(text)),
  };
}

function renderThread() {
  return render(
    <AssistantProvider>
      <AssistantConversation />
    </AssistantProvider>,
  );
}

/**
 * Sends a message the way a creator does.
 *
 * The starting examples fill the composer now rather than sending on one tap, so a stray
 * press cannot spend one of twenty daily messages. Sending is typing and pressing the button.
 */
function ask(question: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Ask Invi" }), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
}

beforeEach(() => {
  deleteConversation.mockClear();
  listConversations.mockClear();
  loadConversation.mockClear();
  saveConversation.mockClear();
  listConversations.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("stopping and editing a message", () => {
  it("offers Stop while the answer runs and Ask when it is not running", async () => {
    const answer = controllableAnswer();
    vi.stubGlobal("fetch", answer.fetch);

    renderThread();
    expect(screen.getByRole("button", { name: "Ask" })).toBeTruthy();

    ask("How do I send personalized links?");

    const stop = await screen.findByRole("button", { name: "Stop" });
    expect(stop).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask" })).toBeNull();
  });

  it("keeps what arrived when the creator stops, and says the message was still spent", async () => {
    const answer = controllableAnswer();
    vi.stubGlobal("fetch", answer.fetch);

    renderThread();
    ask("How do I send personalized links?");

    await screen.findByRole("button", { name: "Stop" });
    answer.push("Open Guests & RSVPs");
    await screen.findByText("Open Guests & RSVPs");

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    // The half-answer stays. A creator who stopped it may still have read what they
    // needed, and deleting it would be a second surprise on top of their own button press.
    await screen.findByText(/You stopped this answer/);
    expect(screen.getByText("Open Guests & RSVPs")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Ask" })).toBeTruthy();
  });

  it("puts the last question back in the composer and takes it off the thread", async () => {
    const answer = controllableAnswer();
    vi.stubGlobal("fetch", answer.fetch);

    renderThread();
    ask("How do I send personalized links?");
    await screen.findByRole("button", { name: "Stop" });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    const composer = screen.getByLabelText("Ask Invi") as HTMLTextAreaElement;
    expect(composer.value).toBe("How do I send personalized links?");
    // Rewound, not appended to: resending continues this conversation rather than
    // stacking a second copy of the question under the first.
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(0);
  });

  it("saves the thread to history once a turn settles", async () => {
    const answer = controllableAnswer();
    vi.stubGlobal("fetch", answer.fetch);

    renderThread();
    ask("How do I send personalized links?");
    await screen.findByRole("button", { name: "Stop" });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => expect(saveConversation).toHaveBeenCalled());
    const saved = saveConversation.mock.calls[0]?.[0] as SavedConversation;
    expect(saved.conversationId).toBeNull();
    // Titled from the creator's own words rather than from a billed call.
    expect(saved.title).toBe("How do I send personalized links?");
    expect(saved.messages[0]?.role).toBe("user");
  });
});

describe("the history list", () => {
  it("loads saved conversations only when the list is asked for", async () => {
    renderThread();
    expect(listConversations).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "History" }));
    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));
  });

  it("explains itself when nothing has been saved yet", async () => {
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: "History" }));

    expect(await screen.findByText(/Your conversations with Invi are saved here/)).toBeTruthy();
  });

  it("opens a saved conversation into the thread", async () => {
    listConversations.mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Why can't my guest see the reply form?",
        updatedAt: new Date().toISOString(),
      },
    ]);
    loadConversation.mockResolvedValue([
      { content: "Why can't my guest see the reply form?", role: "user" },
      { content: "They need a personal link.", role: "assistant" },
    ]);

    renderThread();
    fireEvent.click(screen.getByRole("button", { name: "History" }));

    fireEvent.click(await screen.findByText("Why can't my guest see the reply form?"));

    await screen.findByText("They need a personal link.");
    expect(loadConversation).toHaveBeenCalledWith({
      conversationId: "22222222-2222-4222-8222-222222222222",
    });
    // Choosing a conversation returns to it rather than leaving the creator in the list.
    expect(screen.getByRole("button", { name: "History (1)" })).toBeTruthy();
  });

  it("asks once before deleting, because a deleted thread does not come back", async () => {
    listConversations.mockResolvedValue([
      {
        id: "33333333-3333-4333-8333-333333333333",
        title: "What happens when I publish an update?",
        updatedAt: new Date().toISOString(),
      },
    ]);

    renderThread();
    fireEvent.click(screen.getByRole("button", { name: "History" }));

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete “What happens when I publish an update?”",
      }),
    );
    expect(deleteConversation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(deleteConversation).toHaveBeenCalledWith({
        conversationId: "33333333-3333-4333-8333-333333333333",
      }),
    );
  });
});
