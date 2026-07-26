import { idempotencyKeys, tasks } from "@trigger.dev/sdk";

export class PublicationEnqueueError extends Error {
  constructor(cause?: unknown) {
    super("The publication job could not be started.", { cause });
    this.name = "PublicationEnqueueError";
  }
}

export async function enqueueInvitationPublication(
  publicationId: string,
  requestIdempotencyKey: string,
): Promise<void> {
  try {
    const idempotencyKey = await idempotencyKeys.create(
      `publish-invitation:${publicationId}:${requestIdempotencyKey}`,
      { scope: "global" },
    );
    await tasks.trigger("publish-invitation", { publicationId }, { idempotencyKey });
  } catch (error) {
    // The provider's own message is the only thing that separates a key pointing at
    // the wrong Trigger.dev environment from a task that was never deployed there,
    // and the creator-facing message deliberately says neither. Without this the
    // failure is undiagnosable from the server logs.
    console.error("[publication] enqueue failed", {
      publicationId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    throw new PublicationEnqueueError(error);
  }
}
