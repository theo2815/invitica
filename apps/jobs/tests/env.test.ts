import { describe, expect, it } from "vitest";

import { readJobsEnvironment } from "../src/env.js";

const validEnvironment = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "access-key-id",
  R2_SECRET_ACCESS_KEY: "secret-access-key",
  R2_BUCKET_NAME: "invitica-publications",
};

describe("jobs environment", () => {
  it("ignores unrelated variables supplied by the process and Trigger.dev", () => {
    expect(
      readJobsEnvironment({
        ...validEnvironment,
        PATH: "C:\\Windows\\System32",
        TRIGGER_RUN_ID: "run_test",
      }),
    ).toEqual(validEnvironment);
  });

  it("rejects malformed required provider URLs", () => {
    expect(() =>
      readJobsEnvironment({
        ...validEnvironment,
        SUPABASE_URL: "project.supabase.co",
      }),
    ).toThrow();
  });
});
