# Invitica

[![CI](https://github.com/theo2815/invitica/actions/workflows/ci.yml/badge.svg)](https://github.com/theo2815/invitica/actions/workflows/ci.yml)

Invitica is a Philippines-first platform for creating premium, interactive digital invitation websites. It is designed around mobile-first editing, curated templates, expressive motion, media, and fast account-free guest experiences.

> **Project status:** The production foundation and creator-to-guest vertical slice are live. Creators
> can create, edit, publish, and share Garden Promise and Little Blessings invitations; invited guests
> can open personalized links and reply without an account. Guest management, delivery tracking,
> aggregate results, immutable social-preview cards, and versioned template upgrades are implemented.
> Payments, CSV import, and published audio are not implemented.

## Current foundation

- Strict, versioned invitation documents validated with Zod
- One shared React renderer contract for creator preview and published output
- Safe, data-only templates with no arbitrary HTML, CSS, or JavaScript
- Responsive marketing interactions with keyboard and reduced-motion support
- Supabase email/password and Google OAuth flows with protected creator routes
- Workspace-based ownership and row-level security migration with negative cross-user policy tests
- Party-scoped personalized links and retry-safe account-free RSVP with no raw-token persistence
- Creator guest management, sent tracking, share-message customization, pagination, and aggregate results
- Immutable image publications and template-branded social-preview cards served from private R2
- Two production templates: Garden Promise and Little Blessings; fixture templates remain preview-only
- TypeScript monorepo with pnpm workspaces, Turborepo, Biome, Vitest, and GitHub Actions

## Repository structure

```text
apps/
  jobs/                Trigger.dev publication orchestration
  viewer/              Cloudflare Worker guest invitation viewer
  web/                 Next.js marketing and creator surface
packages/
  database/            Reviewed SQL migrations and database policy tests
  invitation-schema/   Versioned invitation document schemas and fixtures
  renderer/            Shared semantic invitation renderer
  template-kit/        Curated template manifests, versions, starters, and catalog metadata
```

Additional applications and packages are added through verified vertical slices rather than created speculatively.

## Getting started

### Requirements

- Node.js 24.11.1
- Corepack
- pnpm 11.13.0

### Install and run

```bash
corepack enable
pnpm install --frozen-lockfile
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the creator application. During
development, `/i/*` and the Viewer assets are proxied to the separate local Viewer on port 8787,
so creator and guest URLs share the visible `localhost:3000` origin without merging deployables.

### Inspect a published development invitation

A publication delivered to private R2 must be copied into Wrangler's ignored local R2 store before
the local Viewer can read it. Authenticate Wrangler, seed only the required invitation, then run
both development applications:

```bash
pnpm --filter @invitica/viewer exec wrangler login
pnpm --filter @invitica/viewer seed -- http://localhost:3000/i/invitation-<32-character-token>
pnpm dev
```

The seed command reads and validates the alias and immutable artifact from remote R2, then writes
only to local Wrangler storage. It does not deploy the Viewer or mutate remote R2.

### Authentication setup

Set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `apps/web/.env.local`. Next.js loads environment
files from the `apps/web` application root, not the monorepo root. The publishable key is intended
for browser use; never add a Supabase secret/service-role key or Google client secret to a
`NEXT_PUBLIC` variable.

In Supabase:

1. Keep email confirmation enabled for email/password registration.
2. Enable the Google provider and enter the Google Client ID and Client Secret there.
3. Add `http://localhost:3000/auth/callback` and the production equivalent to the authentication
   redirect allow list.
4. In Google Cloud, use Supabase's callback URL:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Explicitly apply and test the reviewed migration under `packages/database`; the application
   never applies migrations at startup.

Google OAuth accounts return with a provider-confirmed email and do not go through Invitica's
separate email confirmation screen. Email/password registrations must follow the emailed
confirmation link before entering the creator dashboard.

## Development workflow

- `main` is the production branch.
- `dev-main` is the active development and integration branch.
- Changes move from `dev-main` to `main` through a GitHub pull request after `pnpm check` passes.
- Repository rulesets and required checks must not be bypassed.

## Deployment

The web application deploys from `main` through its hosting provider. The Viewer Worker and
Trigger.dev publication jobs are separate manual deployments:

- [Viewer deployment guide](./apps/viewer/README.md#manual-production-deployment)
- [Publication-jobs deployment guide](./apps/jobs/README.md#deploying)

Provider deployment state changes outside Git and is tracked in the Invitica Second Brain rather
than repeated here. Deploy only a clean, reviewed `main` revision; merging or pushing alone does not
deploy the Viewer or publication jobs.

## Quality checks

```bash
pnpm check
```

The repository gate runs formatting and lint checks, strict TypeScript validation, tests, and production builds across all packages.

Focused commands are also available:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Architecture principles

- Keep creator workflows in a TypeScript modular monolith.
- Publish immutable, versioned invitation snapshots for edge delivery.
- Use the same renderer contract for preview and guest output.
- Treat mobile performance, accessibility, privacy, and reduced motion as launch requirements.
- Introduce infrastructure only when measured product needs justify it.

Repository-specific engineering and agent guidance lives in [AGENTS.md](./AGENTS.md).

## License

This project is proprietary and currently unlicensed for reuse.
