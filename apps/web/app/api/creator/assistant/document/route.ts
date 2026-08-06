import { NextResponse } from "next/server";

import { assistantDocumentRequestSchema } from "../../../../../src/contracts/assistant-api";
import {
  budgetRefusalMessage,
  consumeAssistantMessage,
  markAssistantMisconfigured,
} from "../../../../../src/server/assistant/budget";
import {
  ASSISTANT_DOCUMENT_MODEL,
  ASSISTANT_SELECTION_MODEL,
  createClaudeProvider,
} from "../../../../../src/server/assistant/claude";
import {
  currentDraftMessage,
  documentSystemPrompt,
  MAX_DOCUMENT_OUTPUT_TOKENS,
} from "../../../../../src/server/assistant/document-prompt";
import {
  type ProposalRejection,
  resolveDocumentProposal,
} from "../../../../../src/server/assistant/document-proposal";
import { buildProposalSchema } from "../../../../../src/server/assistant/document-schema";
import { logAssistantRequest } from "../../../../../src/server/assistant/log";
import {
  type AssistantFailure,
  AssistantProviderError,
  type AssistantUsage,
} from "../../../../../src/server/assistant/provider";
import {
  buildSectionSelectionSchema,
  MAX_SELECTION_OUTPUT_TOKENS,
  resolveSectionSelection,
  sectionSelectionSystemPrompt,
} from "../../../../../src/server/assistant/section-selection";
import { getOptionalConfirmedUser } from "../../../../../src/server/auth/session";
import { loadInvitationDraft } from "../../../../../src/server/invitations/drafts";
import { readJsonRequest } from "../../guest-desk/responses";

// The same twenty-message ceiling as the help route, plus room for one invitation id.
const MAX_REQUEST_BYTES = 48_000;

/**
 * Two model calls happen inside this handler and the second one is a whole invitation, so
 * the platform's default function ceiling is not enough room. `DOCUMENT_REQUEST_TIMEOUT_MS`
 * is deliberately set below this, so a slow generation returns a message a creator can read
 * rather than being killed by the host with no response at all.
 */
export const maxDuration = 60;

const assistantResponseHeaders = {
  "cache-control": "private, no-store",
  "content-type": "application/json",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

/**
 * A rejection is the creator's problem to act on, so each one says what to do next. None of
 * them repeat what the model produced — a hallucinated draft is not evidence a creator can
 * use, and echoing it would put unvalidated model output on screen by the back door.
 */
const rejectionMessage: Record<ProposalRejection, string> = {
  invalid_document:
    "That draft came back incomplete, so nothing was changed. Try describing the invitation again, or one section at a time.",
  section_not_in_draft:
    "That draft included a section this template does not have, so nothing was changed. Try asking again.",
  unreadable: "Tala could not draft that invitation. Try describing it again.",
};

function assistantError(message: string, status: number) {
  return NextResponse.json(
    { message, status: "error" },
    { headers: assistantResponseHeaders, status },
  );
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  // Same order as the help route, and for the same reasons: the cheapest gate first, the
  // budget before the provider, and nothing billed for a request that was never going to
  // be answered.
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
      model: ASSISTANT_DOCUMENT_MODEL,
      outcome,
      stage: "document",
      ...(failure ? { failure } : {}),
      ...(usage ? { usage } : {}),
    });
  }

  function logSelection(
    outcome: Parameters<typeof logAssistantRequest>[0]["outcome"],
    messageCount: number,
    usage?: AssistantUsage,
    failure?: AssistantFailure,
  ) {
    logAssistantRequest({
      creatorId,
      durationMs: Date.now() - startedAt,
      messageCount,
      model: ASSISTANT_SELECTION_MODEL,
      outcome,
      stage: "section-selection",
      ...(failure ? { failure } : {}),
      ...(usage ? { usage } : {}),
    });
  }

  const body = await readJsonRequest(request, MAX_REQUEST_BYTES);
  if (!body.ok) {
    log("invalid", 0);
    return assistantError("That assistant request is not valid.", 400);
  }

  const parsed = assistantDocumentRequestSchema.safeParse(body.input);
  if (!parsed.success) {
    log("invalid", 0);
    return assistantError("That assistant request is not valid.", 400);
  }

  const { invitationId, messages } = parsed.data;

  // Loaded under the creator's own session, so RLS decides whether this invitation is
  // theirs. A draft that is not returns the same answer as one that does not exist.
  const draft = await loadInvitationDraft(session.supabase, invitationId);
  if (!draft) {
    log("invalid", messages.length);
    return assistantError("That invitation is no longer available.", 404);
  }

  const budget = await consumeAssistantMessage(session.supabase);
  if (budget !== "allowed") {
    log("refused_budget", messages.length);
    return NextResponse.json(
      { message: budgetRefusalMessage(budget), status: "refused" },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  const draftMessage = { content: currentDraftMessage(draft.document), role: "user" as const };

  function providerRefusal(error: unknown) {
    return NextResponse.json(
      {
        message:
          error instanceof AssistantProviderError
            ? error.message
            : "Tala could not draft that invitation. Try again in a moment.",
        status: "refused",
      },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  // First call: which sections is this even about? A schema covering every section of a
  // wide template is rejected before any model reads it — see `section-selection.ts` — so
  // the expensive call below is given a narrowed one.
  const selector = createClaudeProvider(ASSISTANT_SELECTION_MODEL);

  let sections: ReturnType<typeof resolveSectionSelection>;
  try {
    const selection = await selector.generate(
      {
        maxOutputTokens: MAX_SELECTION_OUTPUT_TOKENS,
        messages: [draftMessage, ...messages],
        outputSchema: buildSectionSelectionSchema(draft.document, draft.manifest),
        systemPrompt: sectionSelectionSystemPrompt(draft.document, draft.manifest),
      },
      request.signal,
    );

    sections = resolveSectionSelection(selection.output, draft.document, draft.manifest);
    logSelection("completed", messages.length, selection.usage);
  } catch (error) {
    const failure = error instanceof AssistantProviderError ? error.failure : undefined;
    if (failure?.kind === "configuration") markAssistantMisconfigured();

    logSelection("provider_error", messages.length, undefined, failure);
    return providerRefusal(error);
  }

  if (sections.length === 0) {
    // The creator's message was not about the invitation's content, or was too vague to
    // place. Saying so is more useful than drafting a whole invitation nobody asked for,
    // and it costs one cheap call rather than the expensive one.
    log("rejected_proposal", messages.length);
    return NextResponse.json(
      {
        message:
          "I could not tell which part of the invitation to change. Try naming it — the date and venue, the programme, what to wear, or how to reply.",
        status: "refused",
      },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  const provider = createClaudeProvider(ASSISTANT_DOCUMENT_MODEL);

  let generation: Awaited<ReturnType<typeof provider.generate>>;
  try {
    generation = await provider.generate(
      {
        maxOutputTokens: MAX_DOCUMENT_OUTPUT_TOKENS,
        messages: [draftMessage, ...messages],
        outputSchema: buildProposalSchema(draft.document, draft.manifest, sections),
        systemPrompt: documentSystemPrompt(draft.document, draft.manifest, sections),
      },
      request.signal,
    );
  } catch (error) {
    const failure = error instanceof AssistantProviderError ? error.failure : undefined;
    // A rejected key is never billed, so charging every later request a message would take
    // something from creators and save nothing. Refuse them for free instead.
    if (failure?.kind === "configuration") markAssistantMisconfigured();

    log("provider_error", messages.length, undefined, failure);
    return providerRefusal(error);
  }

  // The only path from model output to the client. Everything the creator sees below is a
  // document that has already satisfied the invitation contract; `generation.output` itself
  // is never serialized into a response.
  const proposal = resolveDocumentProposal(generation.output, draft.document, draft.manifest);

  if (proposal.status === "rejected") {
    log("rejected_proposal", messages.length, generation.usage);
    return NextResponse.json(
      { message: rejectionMessage[proposal.reason], status: "refused" },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  log("completed", messages.length, generation.usage);

  return NextResponse.json(
    {
      // Both come from one validation, so the editor's staged payload and the preview on
      // `/dashboard/assistant` cannot describe different invitations.
      details: proposal.details,
      document: proposal.document,
      revision: draft.revision,
      status: "proposed",
    },
    { headers: assistantResponseHeaders, status: 200 },
  );
}
