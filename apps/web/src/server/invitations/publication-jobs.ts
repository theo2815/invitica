import { idempotencyKeys, tasks } from "@trigger.dev/sdk";

export class PublicationEnqueueError extends Error {
  constructor() {
    super("The publication job could not be started.");
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
  } catch {
    throw new PublicationEnqueueError();
  }
}
