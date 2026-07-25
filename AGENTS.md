# Invitica Repository Rulebook

This file governs every agent working anywhere in the Invitica monorepo. Read it before taking project action. A more specific `AGENTS.md` may add constraints for its directory; when rules differ, follow the stricter rule unless the user explicitly directs otherwise.

## Authority and Source-of-Truth Order

The codebase is the source of truth for what is actually implemented.

1. The checked-out code, configuration, migrations, tests, lockfile, and Git state are authoritative for current implementation behavior.
2. The Invitica Second Brain is mandatory context for product intent, accepted decisions, architecture rationale, roadmap, and handoff history.
3. Neither documentation nor tests automatically override observed implementation. Verify relevant claims by inspecting the code and, where practical, running the appropriate checks.
4. When the vault and codebase disagree, do not silently reconcile them:
   - Use the codebase when describing current implemented behavior.
   - State the discrepancy clearly.
   - Determine whether the code is wrong, the documentation is stale, or a decision is unresolved.
   - Update the stale source as part of the authorized task, or ask the user when reconciliation changes product intent or architecture.
5. A proposal, roadmap item, or planned folder in the vault does not mean it has been implemented.
6. Within the vault, use the following roles:
   - Product definitions, the Decision Register, accepted ADRs, and the Roadmap govern intent, accepted choices, and sequencing.
   - Progress notes record verified completed outcomes and validation evidence.
   - `TASK/` notes are operational plans for upcoming or active work. They do not override accepted decisions, the Roadmap, observed code, or the user's current request.

Never claim that a feature exists, a migration ran, a test passes, or a milestone is complete without codebase evidence.

## Branch and Release Workflow

- `main` is the production branch. Do not commit, merge, or push directly to `main` unless the user explicitly authorizes an exceptional production action.
- `dev-main` is the integration branch for active development. Repository changes should be made and committed on `dev-main`, or on a user-requested branch created from `dev-main`.
- Before implementation, verify the active branch with `git branch --show-current`. If it is `main`, switch to `dev-main` before editing. Stop and ask if uncommitted changes make the switch unsafe.
- Promote `dev-main` to `main` only through a GitHub pull request that satisfies the repository ruleset and required checks. Do not bypass protections, force-push, or merge the production branch locally.
- Run `pnpm check` before pushing development changes intended for a pull request.
- After a production pull request is merged, synchronize `dev-main` with `origin/main` before beginning the next development cycle.

## Mandatory New-Session Onboarding

At the beginning of every new root Invitica chat or agent session, before planning or changing the project:

1. Read this `AGENTS.md`.
2. Read the Second Brain starting at:

   `%USERPROFILE%\Documents\Obsidian Vault\Invitica Vault`

3. At minimum, read:
   - `00 - Invitica Home.md`
   - `01 - Product Brief.md`
   - `03 - MVP Product Definition.md`
   - `Decision Register.md`
   - `Roadmap.md`
   - `Progress\00 - Progress Index.md`
   - The latest completed Progress note linked by the Progress index
   - `UI State\00 - UI State Index.md`, plus the specific surface note(s) under `UI State\` relevant to a UI/UX request (these living notes describe current surface state; do not read all of them by default)
   - `Operations\Migration and Environment Ledger.md` — canonical migration and hosted-environment status
   - `Operations\Founder Action Queue.md` — external prerequisites only the founder can clear
   - `Glossary.md` and `Operations\Known Environment Issues.md` as needed for domain terms or local-verification gotchas
   - `TASK\00 - Task Board.md`
   - Only the dated task note currently marked **Next** or **In progress**, when one exists
   - Any architecture, engineering, product, or skill notes relevant to the request
4. Then verify the handoff against the codebase. Inspect at least:
   - `git status --short`
   - The repository structure using `rg --files`
   - Root and relevant package manifests
   - Relevant implementation and tests
5. Before implementation, give the user a concise startup brief containing:
   - What Invitica is
   - The current verified phase
   - What was last completed
   - Today's recommended focus and why it is next
   - Required founder inputs, approvals, or external prerequisites
   - The task's success criteria
   - What remains in progress, blocked, deferred, or unresolved
   - Any disagreement between the vault and codebase

The user's current request controls the session. Do not redirect the user to the Task Board when they explicitly choose a different in-scope task; instead, note any priority difference that materially affects the Roadmap or risk.

Do not repeat the full startup brief on every turn in the same session. If the vault, Progress index, Task Board, or referenced active task is unavailable, say so explicitly, inspect the codebase, and avoid presenting unverified roadmap, task, or business context as fact.

### Task Planning and Lifecycle

- Treat `TASK\00 - Task Board.md` as the operational queue, not as implementation evidence or an independent product authority.
- Read the Task Board plus the single **Next** or **In progress** dated task. Do not load every task note unless the user's request requires broader planning context.
- Before recommending or starting a tracked task, verify that it is still needed against the codebase, Progress index, latest relevant Progress note, Roadmap, Decision Register, and current Git state.
- If a task is stale, already implemented, inconsistent with the Roadmap, missing a prerequisite, or contradicted by code, state the discrepancy. Do not silently follow or rewrite it when reconciliation changes product intent, architecture, security, cost, or sequencing.
- A task note never grants authority to apply migrations, change provider settings, deploy, merge, push, handle secrets, use production data, contact third parties, incur cost, or perform another consequential external action. Obtain the authorization otherwise required by this rulebook and the user's request.
- Never store credentials, access tokens, guest PII, private invitation links, production identifiers, or provider secrets in Task or Progress notes.
- Do not mark a task **Done** because a plan exists, UI shell renders, partial check passes, or work appears likely complete. Require implementation evidence and task-specific success criteria.
- For work tracked in `TASK/`, synchronize the Second Brain after verification:
  1. Create or update the focused Progress note with code paths, evidence, and deliberate boundaries.
  2. Remove the completed item from **Next** or **In progress** and link its Progress note under recently completed work.
  3. Promote the next accepted planned item only when prerequisites and Roadmap alignment are clear.
  4. Reconcile Home, Roadmap, Decision Register, architecture notes, or conventions only when their factual state materially changed.
- If tracked work stops mid-task, keep its status accurate and record the exact verified checkpoint, remaining steps, and named blocker. Do not label ordinary incomplete work as blocked.

### Delegated Subagent Onboarding

The full new-session checklist above applies to the root agent. A delegated subagent must:

1. Read this `AGENTS.md` and any more-specific instruction file governing its assigned files.
2. Read only the vault notes, manifests, implementation, and tests needed for its bounded task.
3. Receive verified startup context, relevant source paths, constraints, and acceptance criteria from the root delegation.
4. Verify claims within its assigned scope and report any codebase/vault disagreement to the root agent.

Subagents do not repeat the full startup brief, make independent product or architecture decisions, or broaden their scope. The Project-Only Design Skill Gate still applies in full to every subagent performing user-facing design, frontend, motion, responsive, or UX work.

## Cost-Conscious Multi-Agent Orchestration

The root agent owns requirements, planning, architecture, security, integration, review, verification, final decisions, and delivery.

Delegate only when at least one condition applies:

- Two or more independent, bounded subtasks can run concurrently.
- A read-heavy investigation would add substantial noise to the root context.
- A repetitive workload is large enough to justify delegation overhead.
- Specialized independent review would materially reduce delivery risk.

Do not delegate simple tasks, ambiguous requirements, tightly coupled changes, or work where agents would edit overlapping files. Prefer no more than two subagents at a time, no nested delegation, and one write owner per file.

Delegate by configured role:

- `worker`: scoped implementation and focused tests.
- `explorer`: codebase or vault research, documentation, investigation, and concise summaries; read-only by default.
- `mechanical`: deterministic repetitive edits or isolated fixes with exact acceptance criteria.

Every delegation must specify scope, relevant context and files, constraints, allowed writes, expected output, acceptance criteria, and required verification. Delegated agents return concise findings or diffs rather than raw logs.

The root agent must inspect delegated results, review all diffs, reconcile conflicts, and run appropriate checks. Delegated output is never considered verified automatically.

Delegation is intended to reduce expensive root-agent work, latency, or context noise. It must not be assumed to reduce total token consumption.

## Project Summary

Invitica is a Philippines-first platform for premium interactive digital invitations. Creators customize and publish mobile-first invitation websites with curated templates, motion, music, media, and event sections. Guests open shared or personalized links without requiring an account. The long-term product may add RSVP operations, guest management, template selling, payments, analytics, and broader event tools, but work must follow the accepted roadmap rather than speculative scope.

The architecture currently calls for:

- A TypeScript modular monolith for creator workflows
- An independently deployable edge viewer for published invitations
- Versioned, schema-validated invitation documents
- One shared renderer for editor preview and guest output
- PostgreSQL as the system of record
- Immutable publication snapshots served from the edge

Do not introduce arbitrary template code, raw HTML/CSS storage, duplicated preview/viewer renderers, microservices, Redis, Kafka, containers, or Kubernetes without an accepted ADR and demonstrated need.

## Project-Only Design Skill Gate

Before planning, generating, reviewing, or editing any user-facing design, frontend layout, visual component, animation, motion behavior, responsive styling, design token, or UX flow, read this project skill in full:

`%USERPROFILE%\Documents\Obsidian Vault\Invitica Vault\Agent Skills\invitica-frontend-design\SKILL.md`

This gate applies even to a seemingly small visual change. It does not apply to backend-only, infrastructure-only, or documentation-only work.

- Treat the design skill as project guidance, while the existing code and design system remain authoritative for implemented tokens and components.
- If the skill is missing, empty, or unreadable, stop before making design changes and tell the user.
- Do not invent a replacement design language when the skill or established design system already answers the question.
- For motion work, preserve keyboard access, reduced-motion behavior, readable fallback states, and mid-range mobile performance.

## Engineering Discipline — Apply Before Coding (MANDATORY)

These rules govern **how** any agent writes code in this monorepo. They are not optional, and they apply **before the first line of code is written** — not as an after-the-fact review. Before implementing anything non-trivial, an agent MUST have satisfied points 1–5 below. **Tradeoff:** These guidelines bias toward caution over speed. For genuinely trivial tasks (typo, single-line edit, lookup), use judgment. If these conflict with a module-specific `AGENTS.md`, follow the stricter rule.

### 1. Confirm Alignment Before Acting

**If a prompt is unclear or you are not fully confident you understood it, ask a clarifying question first — every time. Never guess and proceed.**

- Before starting work, restate your understanding of the request in one or two sentences and confirm it matches the user's intent.
- If anything is ambiguous, underspecified, or open to more than one interpretation, stop and ask before writing code or making changes — do not assume the most likely meaning.
- Ask focused, specific questions (not "what do you want?"). Surface the exact point of confusion and, where helpful, offer the interpretations you're choosing between.
- Only skip this check for genuinely trivial, unambiguous requests (typo fix, single-line edit, direct lookup).
- Better to ask one extra question than to build the wrong thing.

For a clear request, the agent may restate its understanding in a progress update and continue. An explicit reply is required before implementation when ambiguity or a material product, architecture, data, security, cost, or UX choice remains.

### 2. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 3. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 4. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 5. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Invitica-Specific Engineering Guardrails

### Preserve the product boundaries

- Build according to the current roadmap and vertical slice; do not pull post-launch features into MVP work.
- Keep invitation documents versioned, strict, and data-only. Never store or execute user-authored JavaScript, arbitrary HTML, or unrestricted CSS.
- Keep draft, template version, publication snapshot, and active publication concepts distinct.
- Preview and published output must use the same renderer contract. Fix parity issues at the shared boundary.

### Design for the real launch environment

- Mobile-first means the complete creator and guest flows must remain usable on phones, not merely resize to phone widths.
- Treat slower Philippine mobile connections and mid-range devices as normal operating conditions.
- Budget JavaScript, animation, fonts, images, audio, and video deliberately. A premium experience that loads poorly is not premium.
- Respect accessibility semantics, keyboard navigation, contrast, reduced motion, and muted/autoplay browser policies from the first implementation.

### Protect data and money

- Treat guest identities, personalized links, RSVP data, contact details, and event information as sensitive data.
- Do not put PII or secrets in public URLs, logs, analytics payloads, fixtures, screenshots, or error messages.
- Public identifiers must be high-entropy and non-sequential; authorization must not rely on an unguessable URL alone for privileged operations.
- Store money as integer centavos with an ISO currency code. Payment and webhook mutations must be idempotent and auditable.
- Never commit credentials. Add placeholders to `.env.example` and document the owning provider and purpose.

### Control architectural drift

- Use pnpm workspaces and Turborepo.
- Keep deployable applications in `apps/` and reusable code in `packages/`.
- Organize backend code by business domain; transport handlers call domain services.
- Validate all untrusted input at runtime and use strict TypeScript without unbounded `any`.
- Keep provider integrations behind narrow interfaces and do not add a dependency when a small local implementation is clearer.
- Do not apply database migrations automatically at application startup.
- A new infrastructure service, runtime, persistence technology, cross-domain abstraction, or irreversible data model decision requires an explicit tradeoff discussion and usually an ADR.

## Change Safety and Repository Hygiene

- Inspect `git status --short` before and after work. Existing changes belong to the user unless proven otherwise.
- Never discard, overwrite, reformat, or "clean up" unrelated user changes.
- Do not use destructive Git commands or rewrite history without explicit authorization.
- Avoid broad formatter runs when a task only touches a narrow area unless the repository check requires them.
- Add or update focused tests for changed behavior. A test that never failed before the fix is weak evidence for a bug fix.
- Do not weaken types, validation, lint rules, security controls, or tests merely to make a check pass.
- If a required check cannot run, state exactly what was and was not verified.

## Second Brain Synchronization

The vault is the project handoff and decision record, but it must follow verified reality.

- Update existing notes instead of creating duplicate sources of truth.
- Record consequential or difficult-to-reverse decisions as ADRs.
- Update current state, roadmap, schemas, API contracts, conventions, or progress only when the task materially changes them.
- Mark planned work as planned and implemented work as implemented.
- Include relevant code paths and validation evidence in progress notes.
- When a task changes a user-facing surface's visible UI, update that surface's living note under `UI State\` in the same task (set `last_changed_by` and `updated`), keeping it a current-state description only; the dated change history stays in `Progress\`. Capture a milestone screenshot with fixture data only, per `UI State\Screens\00 - Screens README.md`.
- Treat `Operations\Migration and Environment Ledger.md` as the canonical migration and hosted-environment status. When a migration is authored, applied, or verified, update it in the same task and do not restate hosted status as prose in other notes. Keep `Operations\Founder Action Queue.md` current as external prerequisites appear or clear, and record recurring local dev/verification gotchas in `Operations\Known Environment Issues.md`.
- If an implementation changes an accepted decision, update the decision record in the same task after user approval.
- Before completing a major task or planning session, verify that the vault and codebase describe the same current state.

## Verification and Handoff

Use the narrowest useful checks during development, then run the repository gate before handing off a completed code change:

`pnpm check`

For documentation-only changes, verify links, paths, factual consistency, and the final diff; a full build is unnecessary unless the documentation change affects executable configuration.

A final handoff must state:

- What changed
- What was verified
- What remains or is intentionally deferred
- Any risks, assumptions, or source-of-truth discrepancies
- Whether the Second Brain was updated
