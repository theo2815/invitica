import { additionalFiles } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_invitica_local",
  dirs: ["./src/trigger"],
  runtime: "node-22",
  maxDuration: 300,
  legacyDevProcessCwdBehaviour: false,
  build: {
    external: ["sharp"],
    extensions: [
      additionalFiles({
        files: ["./assets/fonts/**"],
      }),
    ],
  },
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 4,
      factor: 2,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      randomize: true,
    },
  },
});
