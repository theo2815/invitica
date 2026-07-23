import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { enqueueInvitationPublication } from "../src/server/invitations/publication-jobs";

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
});
