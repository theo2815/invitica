import { logger, task } from "@trigger.dev/sdk";
import { z } from "zod";

import { R2PublicationObjectStore } from "../adapters/r2-publication-object-store.js";
import { createSupabasePublicationJobRepository } from "../adapters/supabase-publication-repository.js";
import { readJobsEnvironment } from "../env.js";
import { orchestratePublication, type PublicationJobLogger } from "../orchestrate-publication.js";

const publicationTaskPayloadSchema = z.strictObject({ publicationId: z.string().uuid() });

const publicationLogger: PublicationJobLogger = {
  info(message, attributes) {
    logger.info(message, attributes);
  },
  error(message, attributes) {
    logger.error(message, attributes);
  },
};

export const publishInvitationTask = task({
  id: "publish-invitation",
  retry: {
    maxAttempts: 4,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  run: async (payload: unknown, { ctx }) => {
    const { publicationId } = publicationTaskPayloadSchema.parse(payload);
    const environment = readJobsEnvironment();
    const repository = createSupabasePublicationJobRepository(
      environment.SUPABASE_URL,
      environment.SUPABASE_SERVICE_ROLE_KEY,
    );
    const store = new R2PublicationObjectStore({
      endpoint: environment.R2_ENDPOINT,
      accessKeyId: environment.R2_ACCESS_KEY_ID,
      secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
      bucket: environment.R2_BUCKET_NAME,
    });

    return orchestratePublication(repository, store, publicationLogger, publicationId, {
      attemptNumber: ctx.attempt.number,
      maxAttempts: ctx.run.maxAttempts ?? 4,
    });
  },
});
