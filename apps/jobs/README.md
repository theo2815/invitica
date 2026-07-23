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

How to Run the jobs dev:

```bash
  pnpm dlx trigger.dev@4.5.4 dev
```

  If authentication is requested:

```bash
  pnpm dlx trigger.dev@4.5.4 login
  ```

  Use this only to validate compilation:
```bash
  pnpm --filter @invitica/jobs build
```