# Invitica

[![CI](https://github.com/theo2815/invitica/actions/workflows/ci.yml/badge.svg)](https://github.com/theo2815/invitica/actions/workflows/ci.yml)

Invitica is a Philippines-first platform for creating premium, interactive digital invitation websites. It is designed around mobile-first editing, curated templates, expressive motion, media, and fast account-free guest experiences.

> **Project status:** Foundation and walking skeleton. The invitation document contract, shared renderer, responsive marketing landing page, and first authentication/tenancy slice are implemented. Publishing, RSVP operations, and payments are not yet production-ready.

## Current foundation

- Strict, versioned invitation documents validated with Zod
- One shared React renderer contract for creator preview and published output
- Safe, data-only templates with no arbitrary HTML, CSS, or JavaScript
- Responsive marketing interactions with keyboard and reduced-motion support
- Supabase email/password and Google OAuth flows with protected creator routes
- Workspace-based ownership and row-level security migration with negative cross-user policy tests
- TypeScript monorepo with pnpm workspaces, Turborepo, Biome, Vitest, and GitHub Actions

## Repository structure

```text
apps/
  web/                 Next.js marketing and creator surface
packages/
  database/            Reviewed SQL migrations and database policy tests
  invitation-schema/   Versioned invitation document schemas and fixtures
  renderer/            Shared semantic invitation renderer
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
pnpm --filter @invitica/web dev
```

Open [http://localhost:3000](http://localhost:3000) to view the current landing page and interactive invitation preview.

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
