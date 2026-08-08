import { NextResponse } from "next/server";

import {
  ASSISTANT_MODE_LABELS,
  assistantDocumentRequestSchema,
} from "../../../../../src/contracts/assistant-api";
import { describeSectionProgress } from "../../../../../src/lib/invitations/section-progress";
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
  type AssistantIntake,
  buildIntakeSchema,
  intakeSystemPrompt,
  MAX_INTAKE_OUTPUT_TOKENS,
  resolveIntake,
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
  unreadable: "Invi could not draft that invitation. Try describing it again.",
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

  function logIntake(
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
            : "Invi could not draft that invitation. Try again in a moment.",
        status: "refused",
      },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  // First call: what is this request about, and is there enough in it to draft from? A schema
  // covering every section of a wide template is rejected before any model reads it — see
  // `section-selection.ts` — so the expensive call below is given a narrowed one. The same
  // call decides whether the expensive one should run at all.
  //
  // The progress list is computed here rather than asked for: which sections still hold the
  // template's starting text is a diff between two documents the server already has, and
  // paying a model to guess at it would be both slower and less reliable.
  const selector = createClaudeProvider(ASSISTANT_SELECTION_MODEL);

  let intake: AssistantIntake;
  try {
    const selection = await selector.generate(
      {
        maxOutputTokens: MAX_INTAKE_OUTPUT_TOKENS,
        messages: [draftMessage, ...messages],
        outputSchema: buildIntakeSchema(draft.document, draft.manifest),
        systemPrompt: intakeSystemPrompt(
          draft.document,
          draft.manifest,
          describeSectionProgress(draft.document, draft.manifest),
        ),
      },
      request.signal,
    );

    intake = resolveIntake(selection.output, draft.document, draft.manifest);
    logIntake("completed", messages.length, selection.usage);
  } catch (error) {
    const failure = error instanceof AssistantProviderError ? error.failure : undefined;
    if (failure?.kind === "configuration") markAssistantMisconfigured();

    logIntake("provider_error", messages.length, undefined, failure);
    return providerRefusal(error);
  }

  const { questions, sections } = intake;

  if (sections.length === 0 && questions.length > 0) {
    // Nothing to draft yet, and the creator has been asked what is missing. The turn ends
    // here having spent the cheap call and not the expensive one, so a vague request now
    // costs *less* than it did when it produced a near-empty draft.
    //
    // The daily message was already consumed above, and deliberately so: refunding it would
    // mean a creator could spend the model's time without limit by staying vague.
    log("asked_questions", messages.length);
    return NextResponse.json(
      { questions, status: "questions" },
      { headers: assistantResponseHeaders, status: 200 },
    );
  }

  if (sections.length === 0) {
    // The creator's message was not about the invitation's content, and intake found nothing
    // worth asking either. Saying so is more useful than drafting a whole invitation nobody
    // asked for, and it costs one cheap call rather than the expensive one.
    //
    // The likeliest reason a message lands here is that it was a question about how Invitica
    // works, asked from the wrong tab. The composer offers to move those before they are sent;
    // this is the net underneath, and it is Invitica's own sentence rather than the model's.
    log("rejected_proposal", messages.length);
    return NextResponse.json(
      {
        message: `I could not tell which part of the invitation to change. Try naming it — the date and venue, the programme, what to wear, or how to reply. If you were asking how something in Invitica works, ask me again in ${ASSISTANT_MODE_LABELS.help}.`,
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
      // What intake still wanted to know, carried alongside the draft rather than instead of
      // it. Value first: the creator sees what their description already supported, and the
      // questions are about the gap that is left.
      questions,
      revision: draft.revision,
      status: "proposed",
    },
    { headers: assistantResponseHeaders, status: 200 },
  );
}
