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

/** A provider that never touches the network, so the route is tested and nothing is billed. */
function stubProvider(events: AssistantStreamEvent[]) {
  const stream = vi.fn(async function* (_request: AssistantRequest) {
    for (const event of events) yield event;
  });
  vi.mocked(createClaudeProvider).mockReturnValue({ model: "claude-haiku-4-5", stream });
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
      message: "You have used all of today's assistant messages. They refresh tomorrow.",
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
      model: "claude-haiku-4-5",
      stream: async function* () {
        yield { text: "Open the ", type: "text" } as AssistantStreamEvent;
        throw new AssistantProviderError(
          "The assistant is busy right now. Try again in a moment.",
          {
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
