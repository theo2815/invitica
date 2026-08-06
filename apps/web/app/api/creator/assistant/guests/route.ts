import { NextResponse } from "next/server";

import { assistantGuestsRequestSchema } from "../../../../../src/contracts/assistant-api";
import {
  budgetRefusalMessage,
  consumeAssistantMessage,
  markAssistantMisconfigured,
} from "../../../../../src/server/assistant/budget";
import {
  ASSISTANT_GUESTS_MODEL,
  createClaudeProvider,
} from "../../../../../src/server/assistant/claude";
import { guestListSystemPrompt } from "../../../../../src/server/assistant/guest-prompt";
import { resolveGuestPartyProposal } from "../../../../../src/server/assistant/guest-proposal";
import {
  buildGuestPartySchema,
  MAX_GUEST_OUTPUT_TOKENS,
} from "../../../../../src/server/assistant/guest-schema";
import { logAssistantRequest } from "../../../../../src/server/assistant/log";
import {
  type AssistantFailure,
  AssistantProviderError,
  type AssistantUsage,
} from "../../../../../src/server/assistant/provider";
import { getOptionalConfirmedUser } from "../../../../../src/server/auth/session";
import { loadDeliveredGuestInvitation } from "../../../../../src/server/guests/guests";
import { readJsonRequest } from "../../guest-desk/responses";

/**
 * Larger than the document route's ceiling, because the creator's own paste is the payload
 * here rather than a short description of one. Twenty messages at the contract's 2,000
 * characters, plus an invitation id.
 */
const MAX_REQUEST_BYTES = 48_000;

/** One call, but a fifty-row answer. Sized like the document route for the same reason. */
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

  // Same order as the other two assistant routes: the cheapest gate first, the budget before
  // the provider, and nothing billed for a request that was never going to be answered.
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
      model: ASSISTANT_GUESTS_MODEL,
      outcome,
      stage: "guests",
      ...(failure ? { failure } : {}),
      ...(usage ? { usage } : {}),
    });
  }

  const body = await readJsonRequest(request, MAX_REQUEST_BYTES);
  if (!body.ok) {
    log("invalid", 0);
    return assistantError("That assistant request is not valid.", 400);
  }

  const parsed = assistantGuestsRequestSchema.safeParse(body.input);
  if (!parsed.success) {
    log("invalid", 0);
    return assistantError("That assistant request is not valid.", 400);
  }

  const { invitationId, messages } = parsed.data;

  // Guest parties belong to a published invitation, so this is the same load the Guest Desk
  // and `createGuestPartiesAction` use — under the creator's own session, where RLS decides
  // ownership. An invitation that is not theirs and one that is not published answer alike.
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
      "That invitation is not published yet, so it has no guest list. Publish it first.",
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

  const singleRecipient = invitation.occasion === "Romance";
  const provider = createClaudeProvider(ASSISTANT_GUESTS_MODEL);

  let generation: Awaited<ReturnType<typeof provider.generate>>;
  try {
    generation = await provider.generate(
      {
        maxOutputTokens: MAX_GUEST_OUTPUT_TOKENS,
        messages,
        outputSchema: buildGuestPartySchema(singleRecipient),
        systemPrompt: guestListSystemPrompt(singleRecipient, invitation.occasion),
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
            : "Tala could not organize that list. Try again in a moment.",
        status: "refused",
      },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  // The only path from model output to the client. Everything below has passed the same
  // schema `createGuestPartiesAction` validates against; `generation.output` is never
  // serialized into a response, and a refusal quotes nothing the model said.
  const proposal = resolveGuestPartyProposal(generation.output, singleRecipient);

  if (proposal.status === "rejected") {
    log("rejected_proposal", messages.length, generation.usage);
    return NextResponse.json(
      {
        message:
          proposal.reason === "no_parties"
            ? "Tala could not find any guests in that. Paste the list itself — one guest or family per line."
            : "That list came back unreadable, so nothing was added. Try pasting it again.",
        status: "refused",
      },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  log("completed", messages.length, generation.usage);

  return NextResponse.json(
    { invitationId, parties: proposal.parties, status: "parsed" },
    { headers: assistantResponseHeaders, status: 200 },
  );
}
