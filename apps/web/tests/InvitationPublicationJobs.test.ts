import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueueInvitationPublication,
  PublicationEnqueueError,
} from "../src/server/invitations/publication-jobs";

vi.mock("@trigger.dev/sdk", () => ({
  idempotencyKeys: { create: vi.fn() },
  tasks: { trigger: vi.fn() },
}));

const publicationId = "92000000-0000-4000-8000-000000000001";
const requestIdempotencyKey = "91000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.mocked(idempotencyKeys.create).mockReset();
  vi.mocked(tasks.trigger).mockReset();
});

describe("publication job enqueue", () => {
  it("deduplicates one request while allowing a later retry of the same publication", async () => {
    const key = "global-key" as never;
    vi.mocked(idempotencyKeys.create).mockResolvedValue(key);
    vi.mocked(tasks.trigger).mockResolvedValue({ id: "run-id" } as never);

    await enqueueInvitationPublication(publicationId, requestIdempotencyKey);

    expect(idempotencyKeys.create).toHaveBeenCalledWith(
      `publish-invitation:${publicationId}:${requestIdempotencyKey}`,
      { scope: "global" },
    );
    expect(tasks.trigger).toHaveBeenCalledWith(
      "publish-invitation",
      { publicationId },
      { idempotencyKey: key },
    );
  });

  // The creator-facing message is deliberately generic, so the provider's reason has
  // to survive on the error and reach the server log or the failure is undiagnosable.
  it("keeps the provider's reason when the enqueue fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("Invalid API key for environment");
    vi.mocked(idempotencyKeys.create).mockResolvedValue("global-key" as never);
    vi.mocked(tasks.trigger).mockRejectedValue(cause);

    const thrown = await enqueueInvitationPublication(publicationId, requestIdempotencyKey).catch(
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(PublicationEnqueueError);
    expect((thrown as PublicationEnqueueError).cause).toBe(cause);
    expect((thrown as PublicationEnqueueError).message).not.toContain("API key");
    expect(logged).toHaveBeenCalledWith(
      "[publication] enqueue failed",
      expect.objectContaining({ publicationId, reason: "Invalid API key for environment" }),
    );

    logged.mockRestore();
  });
});
