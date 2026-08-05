import { NextResponse } from "next/server";

import { assistantRequestSchema } from "../../../../src/contracts/assistant-api";
import {
  budgetRefusalMessage,
  consumeAssistantMessage,
} from "../../../../src/server/assistant/budget";
import { createClaudeProvider } from "../../../../src/server/assistant/claude";
import { logAssistantRequest } from "../../../../src/server/assistant/log";
import { HELP_SYSTEM_PROMPT, MAX_OUTPUT_TOKENS } from "../../../../src/server/assistant/prompt";
import {
  AssistantProviderError,
  type AssistantUsage,
} from "../../../../src/server/assistant/provider";
import { getOptionalConfirmedUser } from "../../../../src/server/auth/session";
import { readJsonRequest } from "../guest-desk/responses";

// Twenty messages of two thousand characters plus JSON overhead. A body larger than the
// contract can accept is refused before it is parsed.
const MAX_REQUEST_BYTES = 48_000;

const assistantResponseHeaders = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function assistantError(message: string, status: number) {
  return NextResponse.json(
    { message, status: "error" },
    { headers: assistantResponseHeaders, status },
  );
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  // Authentication first. It is the cheapest gate, it is the one that must hold before any
  // billed call, and it is what supplies the creator id every later log line needs.
  const session = await getOptionalConfirmedUser();
  if (!session) return assistantError("Sign in again to continue.", 401);

  const creatorId = session.user.id;
  const provider = createClaudeProvider();

  function log(
    outcome: Parameters<typeof logAssistantRequest>[0]["outcome"],
    messageCount: number,
    usage?: AssistantUsage,
  ) {
    logAssistantRequest({
      creatorId,
      durationMs: Date.now() - startedAt,
      messageCount,
      model: provider.model,
      outcome,
      stage: "help",
      // Omitted rather than logged as null when a request never reached a completion event.
      // An absent key says "no tokens were reported"; `"usage": undefined` would not survive
      // JSON at all, and a zeroed object would read as a free call that was actually billed.
      ...(usage ? { usage } : {}),
    });
  }

  const body = await readJsonRequest(request, MAX_REQUEST_BYTES);
  if (!body.ok) {
    log("invalid", 0);
    return assistantError("That assistant request is not valid.", 400);
  }

  const parsed = assistantRequestSchema.safeParse(body.input);
  if (!parsed.success) {
    log("invalid", 0);
    return assistantError("That assistant request is not valid.", 400);
  }

  const { messages } = parsed.data;

  // Spend the allowance before the provider is reached, so a creator past their cap costs
  // nothing. A refusal here is a 200 with a plain message rather than an error status: the
  // request was well formed and the answer is simply "not right now".
  const budget = await consumeAssistantMessage(session.supabase);
  if (budget !== "allowed") {
    log("refused_budget", messages.length);
    return NextResponse.json(
      { message: budgetRefusalMessage(budget), status: "refused" },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let usage: AssistantUsage | undefined;

      try {
        for await (const event of provider.stream(
          {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            messages,
            systemPrompt: HELP_SYSTEM_PROMPT,
          },
          request.signal,
        )) {
          if (event.type === "text") {
            controller.enqueue(encoder.encode(event.text));
          } else {
            usage = event.usage;
          }
        }

        log("completed", messages.length, usage);
      } catch (error) {
        // The status line is long gone by the time this fires, so the only way to tell the
        // creator anything is in the body. Silence would read as the assistant simply
        // stopping mid-sentence.
        const message =
          error instanceof AssistantProviderError
            ? error.message
            : "The assistant could not finish that answer.";
        controller.enqueue(encoder.encode(`\n\n${message}`));
        log("provider_error", messages.length, usage);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...assistantResponseHeaders, "content-type": "text/plain; charset=utf-8" },
  });
}
