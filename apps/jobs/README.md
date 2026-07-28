# Invitica publication jobs

This application contains the Trigger.dev publication task and its narrow Supabase and Cloudflare
R2 adapters. The task payload contains only a publication UUID. Immutable invitation content stays
in Supabase and is never copied into Trigger payloads or structured logs.

The orchestration writes and reads back the immutable artifact, records its checksum, selects the
desired publication with stale-version protection, conditionally replaces the public alias, and
confirms delivery in Supabase. Retries reuse the same artifact. Alias repair uses conditional R2
writes or deletes so it cannot overwrite a newer publisher.

Copy `.env.example` to the environment managed by Trigger.dev and provide:

- a Trigger.dev project reference and server secret;
- the Supabase project URL and service-role key;
- a least-privilege R2 S3 endpoint, access key, secret, and bucket name.

Wrangler authentication does not provide R2 S3 credentials. Keep every value server-only and out
of repository files. Provider project creation, credential creation, deployment, and hosted
migrations are deliberate external operations and are not performed by application startup.

Local verification:

```bash
pnpm --filter @invitica/jobs typecheck
pnpm --filter @invitica/jobs test
pnpm --filter @invitica/jobs build
```

Run the local Trigger.dev worker from `apps/jobs` with the workspace-pinned CLI:

```bash
cd apps/jobs
pnpm exec trigger dev
```

If authentication is requested:

```bash
pnpm exec trigger login
```

Use the package build only to validate TypeScript compilation; it does not start or deploy a task:

```bash
pnpm --filter @invitica/jobs build
```

## Deploying

Deploy from this directory using the CLI installed in the workspace. The bin is `trigger`,
not `trigger.dev`.

```bash
cd apps/jobs
pnpm exec trigger deploy
```

**Do not use `pnpm dlx trigger.dev@... deploy`.** `dlx` resolves the CLI from pnpm's global
store, which sits outside the repository, so the CLI roots its container build context at the
common ancestor of the store and the project — the user's home directory on Windows. Every path
inside the build then carries that prefix, and a space anywhere in it is percent-encoded and
never decoded, so the build fails with
`Cannot find module '/app/.../Start%20Up%20project/.../trigger.config.mjs'`. Running the
workspace copy roots the context at the repository instead, where the relative path is a plain
`apps/jobs/trigger.config.mjs`. The CLI is a devDependency here so its version stays pinned
alongside `@trigger.dev/sdk`; keep the two equal, and never let `@latest` bump one alone.

This targets the **production** environment. `apps/web` reaches the deployed task through
`TRIGGER_SECRET_KEY`, so that key must belong to the same project and the same environment this
command deployed to — a `tr_dev_*` key only resolves tasks while `trigger.dev dev` is running.

`trigger.config.ts` reads the project from `TRIGGER_PROJECT_REF` and otherwise falls back to
`proj_invitica_local`, which is not a real project. If the CLI does not pick the value up from
`.env.local`, pass it explicitly rather than letting the fallback deploy somewhere unintended:

```bash
pnpm exec trigger deploy --project-ref proj_your_reference
```

**Trigger.dev's GitHub integration does not work with this repository by default.** It looks for
`trigger.config.ts` in the repository root, while this one lives in `apps/jobs`, and the deploy
fails with "Config file not found". Point the config path at `apps/jobs` in the Trigger.dev project
build settings before relying on push-to-deploy. Note also that this package depends on
`@invitica/invitation-schema` through a pnpm workspace link, so any remote build must install from
the workspace root rather than from this directory alone.
