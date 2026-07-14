# Invitica

[![CI](https://github.com/theo2815/invitica/actions/workflows/ci.yml/badge.svg)](https://github.com/theo2815/invitica/actions/workflows/ci.yml)

Invitica is a Philippines-first platform for creating premium, interactive digital invitation websites. It is designed around mobile-first editing, curated templates, expressive motion, media, and fast account-free guest experiences.

> **Project status:** Foundation and walking skeleton. The invitation document contract, shared renderer, and responsive marketing landing page are implemented. Authentication, publishing, RSVP operations, and payments are not yet production-ready.

## Current foundation

- Strict, versioned invitation documents validated with Zod
- One shared React renderer contract for creator preview and published output
- Safe, data-only templates with no arbitrary HTML, CSS, or JavaScript
- Responsive marketing interactions with keyboard and reduced-motion support
- TypeScript monorepo with pnpm workspaces, Turborepo, Biome, Vitest, and GitHub Actions

## Repository structure

```text
apps/
  web/                 Next.js marketing and creator surface
packages/
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
pnpm --filter @invitica/web dev
```

Open [http://localhost:3000](http://localhost:3000) to view the current landing page and interactive invitation preview.

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
