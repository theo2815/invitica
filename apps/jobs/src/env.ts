import { z } from "zod";

const jobsEnvironmentSchema = z.strictObject({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
});

export type JobsEnvironment = z.infer<typeof jobsEnvironmentSchema>;

export function readJobsEnvironment(environment: NodeJS.ProcessEnv = process.env): JobsEnvironment {
  return jobsEnvironmentSchema.parse({
    SUPABASE_URL: environment.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: environment.SUPABASE_SERVICE_ROLE_KEY,
    R2_ENDPOINT: environment.R2_ENDPOINT,
    R2_ACCESS_KEY_ID: environment.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: environment.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: environment.R2_BUCKET_NAME,
  });
}
