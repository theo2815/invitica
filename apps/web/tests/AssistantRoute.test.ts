import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/creator/assistant/route";
import { consumeAssistantMessage } from "../src/server/assistant/budget";
import { createClaudeProvider } from "../src/server/assistant/claude";
import type { AssistantRequest, AssistantStreamEvent } from "../src/server/assistant/provider";
import { AssistantProviderError } from "../src/server/assistant/provider";
import { getOptionalConfirmedUser } from "../src/server/auth/session";

vi.mock("../src/server/auth/session", () => ({ getOptionalConfirmedUser: vi.fn() }));
vi.mock("../src/server/assistant/budget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/assistant/budget")>()),
  consumeAssistantMessage: vi.fn(),
}));
vi.mock("../src/server/assistant/claude", () => ({ createClaudeProvider: vi.fn() }));

const creatorId = "c1000000-0000-4000-8000-000000000001";

const usage = {
  cacheReadInputTokens: 5_100,
  cacheWriteInputTokens: 0,
  inputTokens: 42,
  outputTokens: 88,
};

function request(body: unknown, headers?: HeadersInit) {
  return new Request("https://invitica.app/api/creator/assistant", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

function signedIn() {
  vi.mocked(getOptionalConfirmedUser).mockResolvedValue({
    supabase: { rpc: vi.fn() } as never,
    user: { id: creatorId } as never,
  });
}

/**
 * A creator whose invitation count can actually be read.
 *
 * The plain `signedIn` stub has no `from`, which is the unreachable-database case: context
 * resolution fails, the count is unknown, and the answer still has to arrive. Both are worth
 * covering, so they are separate helpers rather than one that hides the difference.
 */
function signedInWithInvitations(count: number) {
  vi.mocked(getOptionalConfirmedUser).mockResolvedValue({
    supabase: {
      from: () => ({ select: async () => ({ count, error: null }) }),
      rpc: vi.fn(),
    } as never,
    user: { id: creatorId } as never,
  });
}

/**
 * The help route answers by streaming and must never reach the structured path, so the stub
 * throws there rather than returning something plausible. A help request that started
 * calling `generate` would fail loudly here instead of quietly changing what it costs.
 */
function unreachableGenerate(): never {
  throw new Error("The help route must not request a structured document.");
}

/** A provider that never touches the network, so the route is tested and nothing is billed. */
function stubProvider(events: AssistantStreamEvent[]) {
  const stream = vi.fn(async function* (_request: AssistantRequest) {
    for (const event of events) yield event;
  });
  vi.mocked(createClaudeProvider).mockReturnValue({
    generate: unreachableGenerate,
    model: "claude-haiku-4-5",
    stream,
  });
  return stream;
}

let logs: string[];

beforeEach(() => {
  vi.clearAllMocks();
  logs = [];
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the creator assistant route", () => {
  it("rejects a signed-out request before any budget or model call", async () => {
    vi.mocked(getOptionalConfirmedUser).mockResolvedValue(null);
    const stream = stubProvider([]);

    const response = await POST(request({ messages: [{ content: "Hello", role: "user" }] }));

    expect(response.status).toBe(401);
    expect(consumeAssistantMessage).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0);
  });

  it("refuses an exhausted daily allowance before the model is reached", async () => {
    signedIn();
    vi.mocked(consumeAssistantMessage).mockResolvedValue("creator_daily_limit");
    const stream = stubProvider([]);

    const response = await POST(request({ messages: [{ content: "Hello", role: "user" }] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "You have used all of today's messages with Tala. They refresh tomorrow.",
      status: "refused",
    });
    expect(stream).not.toHaveBeenCalled();
  });

  it("names the monthly ceiling separately, because the two reset differently", async () => {
    signedIn();
    vi.mocked(consumeAssistantMessage).mockResolvedValue("global_monthly_limit");

    const response = await POST(request({ messages: [{ content: "Hello", role: "user" }] }));
    const body = (await response.json()) as { message: string };

    expect(body.message).toContain("next month");
    expect(body.message).not.toContain("tomorrow");
  });

  it("rejects a malformed conversation without spending budget", async () => {
    signedIn();
    const stream = stubProvider([]);

    const noTrailingQuestion = await POST(
      request({ messages: [{ content: "An answer", role: "assistant" }] }),
    );
    const tooLong = await POST(
      request({ messages: [{ content: "x".repeat(2_001), role: "user" }] }),
    );
    const oversizedBody = await POST(request({}, { "content-length": "100000" }));

    expect(noTrailingQuestion.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(oversizedBody.status).toBe(400);
    expect(consumeAssistantMessage).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });

  it("streams the answer and sends the corpus as a cacheable system prefix", async () => {
    signedIn();
    vi.mocked(consumeAssistantMessage).mockResolvedValue("allowed");
    const stream = stubProvider([
      { text: "Open ", type: "text" },
      { text: "Guests & RSVPs.", type: "text" },
      { stopReason: "end_turn", type: "complete", usage },
    ]);

    const response = await POST(
      request({ messages: [{ content: "How do I send personalized links?", role: "user" }] }),
    );

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("Open Guests & RSVPs.");

    const sent = stream.mock.calls[0]?.[0] as AssistantRequest;
    expect(sent.systemPrompt).toContain("Invitica help material");
    expect(sent.messages).toEqual([{ content: "How do I send personalized links?", role: "user" }]);
    expect(sent.maxOutputTokens).toBeLessThanOrEqual(600);
  });

  it("sends the creator's situation as a message, never in the cacheable prefix", async () => {
    signedInWithInvitations(0);
    vi.mocked(consumeAssistantMessage).mockResolvedValue("allowed");
    const stream = stubProvider([
      { text: "Open Templates.", type: "text" },
      { stopReason: "end_turn", type: "complete", usage },
    ]);

    const response = await POST(
      request({
        context: { mode: "help", surface: "Overview" },
        messages: [{ content: "Can you help me create my first invitation?", role: "user" }],
      }),
    );
    await response.text();

    const sent = stream.mock.calls[0]?.[0] as AssistantRequest;

    // The prefix is what prompt caching reads. A creator's route or invitation inside it would
    // vary per request and quietly cost full price on every message. Asserted on the context
    // block's own framing rather than on a word like "Overview", which the help corpus
    // legitimately contains.
    expect(sent.systemPrompt).not.toContain("Invitica's own record of where I am");
    expect(sent.systemPrompt).not.toContain("They are on:");

    expect(sent.messages).toHaveLength(2);
    expect(sent.messages[0]?.role).toBe("user");
    expect(sent.messages[0]?.content).toContain("They are on: Overview");
    expect(sent.messages[0]?.content).toContain("have not made an invitation yet");

    // The creator's question stays last. The contract requires it, and answering the message
    // before it would answer the wrong thing.
    expect(sent.messages.at(-1)).toEqual({
      content: "Can you help me create my first invitation?",
      role: "user",
    });
  });

  it("answers without context rather than failing when the database will not describe it", async () => {
    // `signedIn` has no `from`, so the count throws and no invitation was named.
    signedIn();
    vi.mocked(consumeAssistantMessage).mockResolvedValue("allowed");
    const stream = stubProvider([
      { text: "Open Templates.", type: "text" },
      { stopReason: "end_turn", type: "complete", usage },
    ]);

    const response = await POST(
      request({
        context: { mode: "help" },
        messages: [{ content: "How do I start?", role: "user" }],
      }),
    );

    expect(await response.text()).toBe("Open Templates.");

    const sent = stream.mock.calls[0]?.[0] as AssistantRequest;
    const contextLine = sent.messages[0]?.content ?? "";
    expect(contextLine).not.toContain("have not made an invitation");
    expect(sent.messages.at(-1)).toEqual({ content: "How do I start?", role: "user" });
  });

  it("ignores an invitation the creator does not own instead of refusing the answer", async () => {
    vi.mocked(getOptionalConfirmedUser).mockResolvedValue({
      supabase: {
        // RLS returns no row for someone else's invitation, which is the same answer as an
        // id that does not exist. Either way the creator still gets their question answered.
        from: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          select: async () => ({ count: 2, error: null }),
        }),
        rpc: vi.fn(),
      } as never,
      user: { id: creatorId } as never,
    });
    vi.mocked(consumeAssistantMessage).mockResolvedValue("allowed");
    const stream = stubProvider([
      { text: "Here is how.", type: "text" },
      { stopReason: "end_turn", type: "complete", usage },
    ]);

    const response = await POST(
      request({
        context: { invitationId: "d1000000-0000-4000-8000-000000000009", mode: "help" },
        messages: [{ content: "What does Section 5 do?", role: "user" }],
      }),
    );

    expect(await response.text()).toBe("Here is how.");

    const sent = stream.mock.calls[0]?.[0] as AssistantRequest;
    expect(sent.messages[0]?.content).not.toContain("Garden Promise");
  });

  it("logs request metadata and never the question or the answer", async () => {
    signedIn();
    vi.mocked(consumeAssistantMessage).mockResolvedValue("allowed");
    stubProvider([
      { text: "Publishing an update keeps the same link.", type: "text" },
      { stopReason: "end_turn", type: "complete", usage },
    ]);

    const response = await POST(
      request({ messages: [{ content: "Does the guest link change?", role: "user" }] }),
    );
    await response.text();

    const line = logs.join("\n");
    expect(line).toContain(creatorId);
    expect(line).toContain('"outcome":"completed"');
    expect(line).toContain('"stage":"help"');
    expect(line).toContain('"outputTokens":88');
    expect(line).not.toContain("Does the guest link change?");
    expect(line).not.toContain("Publishing an update keeps the same link.");
    expect(line).not.toContain("Invitica help material");
  });

  it("tells the creator when an answer breaks off part way", async () => {
    signedIn();
    vi.mocked(consumeAssistantMessage).mockResolvedValue("allowed");
    vi.mocked(createClaudeProvider).mockReturnValue({
      generate: unreachableGenerate,
      model: "claude-haiku-4-5",
      stream: async function* () {
        yield { text: "Open the ", type: "text" } as AssistantStreamEvent;
        throw new AssistantProviderError(
          "The assistant is busy right now. Try again in a moment.",
          {
            failure: { kind: "transient", name: "RateLimitError", status: 429 },
            retryable: true,
          },
        );
      },
    });

    const response = await POST(request({ messages: [{ content: "Hello", role: "user" }] }));
    const text = await response.text();

    expect(text).toContain("Open the ");
    expect(text).toContain("busy right now");
    expect(logs.join("\n")).toContain('"outcome":"provider_error"');
  });
});
