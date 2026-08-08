import { NextResponse } from "next/server";

import { assistantMessageRequestSchema } from "../../../../../src/contracts/assistant-api";
import {
  budgetRefusalMessage,
  consumeAssistantMessage,
  markAssistantMisconfigured,
} from "../../../../../src/server/assistant/budget";
import {
  ASSISTANT_MESSAGE_MODEL,
  createClaudeProvider,
} from "../../../../../src/server/assistant/claude";
import { logAssistantRequest } from "../../../../../src/server/assistant/log";
import { shareMessageSystemPrompt } from "../../../../../src/server/assistant/message-prompt";
import { resolveShareMessageProposal } from "../../../../../src/server/assistant/message-proposal";
import {
  buildShareMessageSchema,
  MAX_MESSAGE_OUTPUT_TOKENS,
} from "../../../../../src/server/assistant/message-schema";
import {
  type AssistantFailure,
  AssistantProviderError,
  type AssistantUsage,
} from "../../../../../src/server/assistant/provider";
import { getOptionalConfirmedUser } from "../../../../../src/server/auth/session";
import { loadDeliveredGuestInvitation } from "../../../../../src/server/guests/guests";
import { readJsonRequest } from "../../guest-desk/responses";

/**
 * Sized like the guest route rather than the document one. The creator's current wording
 * rides in the conversation, so a thread can carry two 2,000-character messages per turn on
 * top of what they typed.
 */
const MAX_REQUEST_BYTES = 48_000;

/** Two short templates. Well inside the ceiling the document route needs. */
export const maxDuration = 60;

const assistantResponseHeaders = {
  "cache-control": "private, no-store",
  "content-type": "application/json",
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

  // The same order as the other three assistant routes: the cheapest gate first, the budget
  // before the provider, and nothing billed for a request that was never going to be answered.
  const session = await getOptionalConfirmedUser();
  if (!session) return assistantError("Sign in again to continue.", 401);

  const creatorId = session.user.id;

  function log(
    outcome: Parameters<typeof logAssistantRequest>[0]["outcome"],
    messageCount: number,
    usage?: AssistantUsage,
    failure?: AssistantFailure,
  ) {
    logAssistantRequest({
      creatorId,
      durationMs: Date.now() - startedAt,
      messageCount,
      model: ASSISTANT_MESSAGE_MODEL,
      outcome,
      stage: "message",
      ...(failure ? { failure } : {}),
      ...(usage ? { usage } : {}),
    });
  }

  const body = await readJsonRequest(request, MAX_REQUEST_BYTES);
  if (!body.ok) {
    log("invalid", 0);
    return assistantError("That assistant request is not valid.", 400);
  }

  const parsed = assistantMessageRequestSchema.safeParse(body.input);
  if (!parsed.success) {
    log("invalid", 0);
    return assistantError("That assistant request is not valid.", 400);
  }

  const { invitationId, messages } = parsed.data;

  // The share message belongs to a published invitation — it carries its link. This is the
  // same load the Guest Desk and `saveInvitationShareMessagesAction` use, under the creator's
  // own session where RLS decides ownership. An invitation that is not theirs and one that is
  // not published answer alike.
  const { data: workspaceId } = await session.supabase.rpc("ensure_personal_workspace");
  const invitation =
    typeof workspaceId === "string"
      ? await loadDeliveredGuestInvitation(session.supabase, workspaceId, invitationId).catch(
          () => null,
        )
      : null;

  if (!invitation) {
    log("invalid", messages.length);
    return assistantError(
      "That invitation is not published yet, so it has no link to write a message about. Publish it first.",
      404,
    );
  }

  const budget = await consumeAssistantMessage(session.supabase);
  if (budget !== "allowed") {
    log("refused_budget", messages.length);
    return NextResponse.json(
      { message: budgetRefusalMessage(budget), status: "refused" },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  const personalOnly = invitation.occasion === "Romance";
  const provider = createClaudeProvider(ASSISTANT_MESSAGE_MODEL);

  let generation: Awaited<ReturnType<typeof provider.generate>>;
  try {
    generation = await provider.generate(
      {
        maxOutputTokens: MAX_MESSAGE_OUTPUT_TOKENS,
        messages,
        outputSchema: buildShareMessageSchema(personalOnly),
        systemPrompt: shareMessageSystemPrompt(invitation, personalOnly),
      },
      request.signal,
    );
  } catch (error) {
    const failure = error instanceof AssistantProviderError ? error.failure : undefined;
    // A rejected key is never billed, so charging every later request a message would take
    // something from creators and save nothing. Refuse them for free instead.
    if (failure?.kind === "configuration") markAssistantMisconfigured();

    log("provider_error", messages.length, undefined, failure);
    return NextResponse.json(
      {
        message:
          error instanceof AssistantProviderError
            ? error.message
            : "Invi could not write that message. Try again in a moment.",
        status: "refused",
      },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  // The only path from model output to the client. Everything below has passed the same
  // schema the save validates against, so a proposal that would be rejected on save is never
  // offered; `generation.output` is never serialized into a response, and a refusal quotes
  // nothing the model said.
  const proposal = resolveShareMessageProposal(generation.output, personalOnly);

  if (proposal.status === "rejected") {
    log("rejected_proposal", messages.length, generation.usage);
    return NextResponse.json(
      {
        message:
          proposal.reason === "no_messages"
            ? "Invi could not write a usable message from that. Say what you want it to sound like, or what it should mention."
            : "That message came back unreadable, so nothing was changed. Try asking again.",
        status: "refused",
      },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  if (proposal.status === "questions") {
    log("asked_questions", messages.length, generation.usage);
    return NextResponse.json(
      { questions: proposal.questions, status: "questions" },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  log("completed", messages.length, generation.usage);

  return NextResponse.json(
    {
      general: proposal.messages.general,
      personal: proposal.messages.personal,
      questions: proposal.questions,
      status: "written",
    },
    { headers: assistantResponseHeaders, status: 200 },
  );
}
