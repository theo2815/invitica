import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/creator/assistant/message/route";
import { consumeAssistantMessage } from "../src/server/assistant/budget";
import { ASSISTANT_MESSAGE_MODEL, createClaudeProvider } from "../src/server/assistant/claude";
import {
  type AssistantGenerateRequest,
  AssistantProviderError,
} from "../src/server/assistant/provider";
import { getOptionalConfirmedUser } from "../src/server/auth/session";
import { loadDeliveredGuestInvitation } from "../src/server/guests/guests";

vi.mock("../src/server/auth/session", () => ({ getOptionalConfirmedUser: vi.fn() }));
vi.mock("../src/server/assistant/budget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/assistant/budget")>()),
  consumeAssistantMessage: vi.fn(),
  markAssistantMisconfigured: vi.fn(),
}));
vi.mock("../src/server/assistant/claude", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/assistant/claude")>()),
  createClaudeProvider: vi.fn(),
}));
vi.mock("../src/server/guests/guests", () => ({ loadDeliveredGuestInvitation: vi.fn() }));

const creatorId = "c2000000-0000-4000-8000-000000000001";
const invitationId = "a2000000-0000-4000-8000-000000000002";
const workspaceId = "w2000000-0000-4000-8000-000000000003";

const personal = "Hi, {recipient} — we would love you at {celebrant}'s {occasion}. {link}";
const general = "Dear, Family & Friends — {celebrant}'s {occasion} is here. {link}";

const usage = {
  cacheReadInputTokens: 512,
  cacheWriteInputTokens: 0,
  inputTokens: 300,
  outputTokens: 180,
};

function request(body: unknown) {
  return new Request("https://invitica.app/api/creator/assistant/message", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function signedIn(occasion: null | string = "Wedding") {
  vi.mocked(getOptionalConfirmedUser).mockResolvedValue({
    supabase: { rpc: vi.fn().mockResolvedValue({ data: workspaceId, error: null }) } as never,
    user: { id: creatorId } as never,
  });
  vi.mocked(loadDeliveredGuestInvitation).mockResolvedValue({
    invitationId,
    occasion,
    title: "Mara & Joaquin",
  } as never);
}

function stubProvider(output: unknown) {
  const generate = vi.fn(async (_request: AssistantGenerateRequest) => ({
    output,
    stopReason: "end_turn",
    usage,
  }));
  vi.mocked(createClaudeProvider).mockReturnValue({
    generate,
    model: ASSISTANT_MESSAGE_MODEL,
    stream: () => {
      throw new Error("Message writing must not stream.");
    },
  });
  return generate;
}

function body(messages = [{ content: "warm but short", role: "user" }]) {
  return { invitationId, messages };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumeAssistantMessage).mockResolvedValue("allowed");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the message-writing route", () => {
  it("refuses a signed-out request before anything else happens", async () => {
    vi.mocked(getOptionalConfirmedUser).mockResolvedValue(null);

    const response = await POST(request(body()));

    expect(response.status).toBe(401);
    expect(consumeAssistantMessage).not.toHaveBeenCalled();
    expect(createClaudeProvider).not.toHaveBeenCalled();
  });

  it("refuses an unpublished or unowned invitation without spending a message", async () => {
    vi.mocked(getOptionalConfirmedUser).mockResolvedValue({
      supabase: { rpc: vi.fn().mockResolvedValue({ data: workspaceId, error: null }) } as never,
      user: { id: creatorId } as never,
    });
    vi.mocked(loadDeliveredGuestInvitation).mockResolvedValue(null as never);

    const response = await POST(request(body()));

    expect(response.status).toBe(404);
    // The budget sits behind the ownership check, so a request that was never going to be
    // answered costs a creator nothing.
    expect(consumeAssistantMessage).not.toHaveBeenCalled();
    expect(createClaudeProvider).not.toHaveBeenCalled();
  });

  it("spends the message before the provider is reached", async () => {
    signedIn();
    vi.mocked(consumeAssistantMessage).mockResolvedValue("creator_daily_limit");

    const response = await POST(request(body()));
    const payload = (await response.json()) as { status: string };

    expect(payload.status).toBe("refused");
    expect(createClaudeProvider).not.toHaveBeenCalled();
  });

  it("returns wording that survived the save's own schema", async () => {
    signedIn();
    stubProvider({ general, personal, questions: [] });

    const response = await POST(request(body()));
    const payload = (await response.json()) as {
      general: string;
      personal: string;
      status: string;
    };

    expect(payload.status).toBe("written");
    expect(payload.personal).toBe(personal);
    expect(payload.general).toBe(general);
  });

  it("never serializes what the model said when it refuses", async () => {
    signedIn();
    // No `{link}`, and an invented placeholder. Both would reach a guest as broken text.
    stubProvider({ general: null, personal: "See you at {venue}!", questions: [] });

    const response = await POST(request(body()));
    const payload = (await response.json()) as { message: string; status: string };

    expect(payload.status).toBe("refused");
    expect(payload.message).not.toContain("{venue}");
    expect(payload.message).not.toContain("See you at");
  });

  it("answers with questions when there was nothing to write from", async () => {
    signedIn();
    stubProvider({
      general: null,
      personal: null,
      questions: ["How formal should it sound?", "Should it mention the reception?"],
    });

    const response = await POST(request(body([{ content: "write my message", role: "user" }])));
    const payload = (await response.json()) as { questions: string[]; status: string };

    expect(payload.status).toBe("questions");
    expect(payload.questions).toHaveLength(2);
  });

  it("offers Romance no general field at all", async () => {
    signedIn("Romance");
    const generate = stubProvider({ personal, questions: [] });

    await POST(request(body()));

    const schema = generate.mock.calls[0]?.[0].outputSchema as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties)).not.toContain("general");
  });

  it("carries the conversation to the model rather than only the newest message", async () => {
    signedIn();
    const generate = stubProvider({ general: null, personal, questions: [] });

    const thread = [
      { content: "warm but short", role: "user" },
      { content: "I have written that into the fields below.", role: "assistant" },
      { content: "[Invitica — the wording currently in the creator's fields]", role: "assistant" },
      { content: "make it shorter", role: "user" },
    ];
    await POST(request(body(thread)));

    expect(generate.mock.calls[0]?.[0].messages).toHaveLength(4);
  });

  it("turns a provider failure into a refusal rather than an error page", async () => {
    signedIn();
    vi.mocked(createClaudeProvider).mockReturnValue({
      generate: () => {
        throw new AssistantProviderError("Invi is busy right now.", {
          failure: { kind: "transient", name: "APIConnectionError" },
          retryable: true,
        });
      },
      model: ASSISTANT_MESSAGE_MODEL,
      stream: () => {
        throw new Error("Message writing must not stream.");
      },
    });

    const response = await POST(request(body()));
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("refused");
  });

  it("rejects a request that is not shaped like one", async () => {
    signedIn();

    // The last message must come from the creator, or there is nothing to answer.
    const response = await POST(
      request(body([{ content: "I have written that.", role: "assistant" }])),
    );

    expect(response.status).toBe(400);
    expect(consumeAssistantMessage).not.toHaveBeenCalled();
  });
});
