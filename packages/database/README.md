# Invitica database

This package contains reviewed SQL migrations and database policy tests. It does not connect to a
database during application startup, and migrations must never be applied automatically by the web
application.

## Initial identity and tenancy foundation

`migrations/0001_identity_tenancy.sql` creates:

- a self-managed application profile linked to `auth.users`;
- one personal workspace per authenticated creator;
- one active owner membership for that workspace;
- explicit table privileges and row-level security policies; and
- `ensure_personal_workspace()`, an idempotent authenticated provisioning function.

Creator-owned product records added later must reference `workspace_id`. A profile or auth user ID is
not the ownership boundary. Application services must still check active workspace membership and
the required role server-side; RLS is defense in depth.

The provisioning function accepts no user ID, derives identity only from `auth.uid()`, uses a fixed
empty `search_path`, and is executable only by the `authenticated` database role. Browser code does
not require a service key.

## Invitation draft foundation

`migrations/0002_invitation_draft_foundation.sql` creates the minimum mutable creator records needed
to start an invitation from a template:

- workspace-owned events with supported occasion, locale, timezone, and optional schedule fields;
- draft-only invitations pinned to a repository-owned template version UUID;
- one current JSONB draft per invitation with a monotonic revision; and
- composite foreign keys and RLS policies that prevent cross-workspace relationships and access.

The database enforces the document object shape, schema-version pin, template-version pin, and
revision sequence. The shared TypeScript invitation schema remains authoritative for the complete
document shape, so application services must parse every untrusted document before storing,
rendering, or publishing it. Publication snapshots, public identifiers, guest links, and RSVP data
are intentionally outside this migration.

## Transactional draft creation

`migrations/0003_create_invitation_draft_rpc.sql` adds the narrow authenticated
`create_invitation_draft()` RPC used by the creator application. The function derives the current
user through `auth.uid()`, requires their active personal-workspace owner membership, and creates
the event, invitation, and revision-one draft in one transaction.

The caller supplies a random invitation UUID as the creation key. A transaction-scoped advisory
lock serializes repeated submissions for that key. Identical retries return the existing invitation;
reusing the key with different input fails, and a collision from another workspace rolls back
without leaving an event. Only the authenticated role can execute the function. The application
still resolves an allowlisted production template and parses the complete invitation document
before calling the RPC.

## Constrained hero autosave

`migrations/0004_update_invitation_hero_rpc.sql` adds the first revision-aware editing boundary.
The authenticated RPC accepts only the invitation hero title, subtitle, and display date, derives
the caller through `auth.uid()`, verifies active workspace ownership explicitly, locks the current
draft row, and rejects stale expected revisions instead of overwriting newer work.

The function uses a fixed empty search path and a narrow `security definer` boundary so direct
authenticated updates to the draft document and revision can be revoked. Empty optional hero
fields are removed from the document, the title and supported lengths are validated again in SQL,
and non-hero sections are preserved unchanged. The application still parses the complete proposed
document with `@invitica/invitation-schema` before invoking the RPC.

## Immutable publication snapshot foundation

`migrations/0005_publication_snapshot_foundation.sql` adds the database-backed draft-to-publication
boundary for the production Garden Promise template:

- immutable publication-version rows pin the snapshot contract, invitation schema, allowlisted
  renderer key and version, template version, exact draft revision, document, and resolved asset
  manifest;
- a separate build row carries the narrow `pending`, `completed`, or `failed` lifecycle so
  artifact processing never mutates the immutable snapshot;
- one high-entropy alias per invitation points to at most one completed publication while retaining
  older versions for rollback;
- the authenticated request RPC derives the owner from `auth.uid()`, locks the current draft,
  enforces the expected revision, and returns the original record for an identical idempotent retry;
  and
- service-role-only completion, failure, and activation RPCs prevent creator sessions from claiming
  an artifact exists or switching the public pointer directly.

The current server boundary accepts only asset-free Garden Promise drafts because the media
readiness pipeline is not implemented. The reusable snapshot contract already requires checksums,
byte lengths, content types, and safe object keys when assets are introduced. Migration `0005` is
applied to hosted Supabase and the private Cloudflare R2 bucket `invitica-storage` is provisioned.

## Publication delivery orchestration

`migrations/0006_publication_delivery_orchestration.sql` adds the retry-safe delivery model used by
the creator application and background publication job:

- one publication per invitation draft revision, so repeated creator requests reuse the immutable
  snapshot instead of creating duplicate versions;
- build attempt counters and timestamps without weakening completed-artifact immutability;
- separate desired and confirmed-delivered publication references on each public alias;
- explicit pending, retrying, failed, and delivered alias states; and
- service-role transitions for starting, completing, selecting, failing, confirming, and rolling
  back publication delivery.

Existing `0005` active pointers are carried forward as desired pending deliveries. They are not
backfilled as delivered because the database has no evidence that an R2 alias was written and
verified. The founder confirmed on 2026-07-22 that hosted migrations `0006`, `0007`, and `0008` had been
applied. Hosted `0006` is development-provider verified, and hosted `0008` matches the clean
disposable schema and passed a reversible fictional live flow. Hosted `0007` deletion remains
founder-confirmed but independently unverified.

## Unpublished deletion boundary

`migrations/0007_delete_unpublished_invitation.sql` permits an authenticated owner to delete only
an invitation that has never entered publication. Submitted or delivered invitations remain
protected until a separate R2-aware revocation workflow exists.

## Guest parties and privacy-safe personalized links

`migrations/0008_guest_parties_personalized_links.sql` adds the local Step 8 data boundary:

- invitation-scoped guest parties with separate private organizer labels, guest-visible envelope
  greetings, and bounded capacity;
- optional ordered named guests, limited by party capacity;
- one active personalized link per party while retaining revoked-link history;
- 256-bit raw tokens represented in links only as URL fragments, with only keyed SHA-256 hashes
  stored in PostgreSQL;
- active-owner RLS for creator reads and narrow authenticated RPCs for atomic creation,
  replacement, and revocation; and
- a service-role-only resolver that returns only the matching party greeting for a delivered
  invitation and active hash.

Migration `0008` and its 34-assertion pgTAP suite are implemented and pass from a clean disposable
local Supabase project. Hosted migration `0008` definitions and explicit privileges match that
clean schema, and a reversible fictional hosted-to-Viewer flow verifies authenticated creation,
resolution, revocation, generic fallback, and cascade cleanup. Required web secrets are configured
only in the ignored local environment; production secret configuration and deployment remain gated.

## Account-free RSVP persistence

`migrations/0009_account_free_rsvp.sql` adds the local Step 9 mutation boundary:

- one response per invitation-scoped guest party with attending or declined state, bounded party
  size, an optional 500-character message, monotonic revision, and last-mutation UUID;
- active-owner RLS for future creator reads while direct browser and anonymous writes remain denied;
- a service-role-only context resolver that returns only the valid party's capacity, published
  deadline state, and existing response;
- a service-role-only mutation RPC that locks the active personalized capability and party,
  enforces the delivered immutable snapshot's visible RSVP section and deadline, prevents capacity
  overflow, rejects stale revisions, and returns an exact last-mutation retry without incrementing;
  and
- cascade cleanup with the guest party while retaining a private response when only its link is
  revoked or replaced.

Migrations `0001` through `0009` apply cleanly to a fresh disposable local Supabase project, and
the focused `0009` pgTAP suite passes all 32 assertions. Migration `0009` has not been applied to
hosted Supabase; production routing, provider rate limits/Turnstile, and deployment remain
separately authorized release work.

## Creator dashboard result aggregates

`migrations/0010_creator_dashboard_results.sql` adds the local Step 10 view-measurement boundary:

- one UTC-day aggregate per workspace-owned invitation, containing only the date, count, and last
  view timestamp;
- owner-only reads through RLS, with no authenticated or anonymous table writes;
- a service-role-only function that accepts a delivered 128-bit public identifier and atomically
  increments its daily aggregate; and
- no IP address, user agent, referrer, guest identity, fragment capability, session identifier, or
  raw URL storage.

The count is an approximate repeatable successful-page-load metric, not a unique-visitor,
envelope-open, delivery, or billing measure. Migrations `0001` through `0010` apply cleanly to a
fresh disposable local Supabase project, and all 17 focused `0010` pgTAP assertions pass. Hosted
`0009` and `0010` remain unapplied.

## Applying and testing

Apply migrations explicitly through the reviewed Supabase migration workflow. Do not run this SQL
automatically at application startup.

After applying the migrations to a disposable local or test Supabase database with pgTAP available,
run the matching files in `tests/` in numeric order using the project's database test runner or
`psql` with `ON_ERROR_STOP` enabled. The policy tests cover RLS enablement, provisioning,
anonymous denial, cross-user isolation, workspace relationship integrity, document pins, and draft
revision sequencing. The `0003` suite additionally covers transactional creation, identical retries,
conflicting key reuse, and cross-workspace collision rollback.

On 2026-07-19, migrations `0001` through `0005` were applied from a clean disposable local
Supabase project and all five pgTAP suites passed with 136 assertions. Hosted `0003` through `0005`
were applied manually through SQL Editor and have no corresponding Supabase migration-history
records. Hosted `0005` was independently verified with a schema-only catalog dump and the same
transaction-wrapped 47-assertion pgTAP suite. The private `invitica-storage` bucket also passed a
fictional-object write/read/SHA-256/delete probe with no object retained. This accepted checkpoint
does not authorize bypassing migration tracking for later work.

On 2026-07-20, migrations `0001` through `0006` were applied to a separate disposable local
Supabase project. The focused `0005` and `0006` suites passed 84 assertions total (48 and 36).
No hosted migration was applied as part of that verification. On 2026-07-22, the founder confirmed
that hosted migrations `0006`, `0007`, and `0008` had since been applied. Later that day, migrations
`0001` through `0008` applied cleanly to a separate disposable local project, all 34 focused `0008`
assertions passed, hosted `0008` matched the clean schema, and the reversible fictional live flow
passed. Hosted `0007` deletion remains independently unverified.

On 2026-07-23, migrations `0001` through `0009` applied cleanly to a fresh disposable local
project and all 32 focused `0009` assertions passed. No hosted migration or provider configuration
was changed during Step 9 verification.

Later on 2026-07-23, migrations `0001` through `0010` applied cleanly to a new disposable local
project and all 17 focused `0010` assertions passed. Browser verification used fictional local
publication, guest, RSVP, and aggregate data only; no hosted migration, provider configuration, or
production data changed.

## Garden Promise event-detail editing

Migration 0011 expands the revision-aware creator editing boundary without exposing generic
document writes. Its authenticated RPC accepts only the Garden Promise hero, venue, and RSVP fields
required by the minimum usable editor, derives the creator through auth.uid(), verifies active owner
membership, locks the draft row, and rejects stale revisions.

The function validates required venue data, permits only HTTP or HTTPS map links, stores an optional
RSVP date at the end of the selected day in Asia/Manila, and preserves every unrelated document
field and section. Direct authenticated updates remain revoked. Migrations 0001 through 0011 apply
cleanly to a fresh disposable local Supabase project, and all 23 focused 0011 pgTAP assertions pass.
The founder reported applying migration `0011` through the hosted Supabase SQL Editor on
2026-07-23. Independent hosted catalog or live-behavior verification remains pending.

## Guest-desk bulk management and recoverable sharing

Migration `0012` adds the creator-side guest-management boundary needed for efficient bulk entry
and repeatable smart-copy actions:

- an idempotent authenticated RPC creates between 1 and 50 RSVP parties, their named members, and
  one active private link per party in a single transaction;
- active parties carry monotonic revisions, while reversible trash keeps private RSVP history out
  of active creator totals without deleting it;
- named-member removal, party trash, and restore reject stale revisions instead of overwriting
  newer creator state;
- raw private tokens remain absent from PostgreSQL: the existing keyed hash stays authoritative for
  guest resolution, while a separately keyed AES-256-GCM ciphertext supports creator-initiated
  re-copying through an owner-only RPC;
- authenticated table reads cannot select ciphertext, nonces, key versions, or batch idempotency
  metadata; and
- every revocation path destroys recoverable token material. Restoring a party never reactivates a
  revoked link, so the creator must explicitly create a fresh capability.

The matching `0012` pgTAP suite contains 29 transaction-wrapped assertions for privileges,
idempotent retries, conflicting mutation keys, member revisions, reversible trash, token-material
destruction, and cross-owner denial. All 29 pass against a disposable PostgreSQL instance as of
2026-07-26. Migration `0012`
was founder-applied through the hosted Supabase SQL Editor on 2026-07-24. PostgREST exposes the
new bulk RPC with its intended role restriction, but the first authenticated creator call exposed
the ciphertext-regex defect described below. The new encryption secret is configured only in the
ignored local web environment, not in a hosted web environment.

Migration `0013_guest_link_ciphertext_regex_hotfix.sql` corrects the initial ciphertext validation
bound from `{32,256}` to the exact AES-GCM base64url length `{79}`. PostgreSQL rejects repetition
bounds above 255 only when the expression is evaluated, so `0012` could install successfully but
the first hosted bulk-creation call failed with SQLSTATE `2201B`. The additive hotfix replaces the
already-installed table constraint and both affected RPC definitions transactionally. Migration
`0012` is corrected as well for future clean installations, and the focused `0013` pgTAP catalog
suite guards all three definitions. The founder applied hosted `0013` and verified successful creator
guest creation on 2026-07-24.

## Revision-safe guest-party editing

Migration `0014_update_guest_party.sql` adds the authenticated owner-only RPC used by the Guest Desk
edit dialog. One transaction updates the party label, envelope name, capacity, and ordered named-member
list while preserving the party's private invitation link and RSVP history. The RPC locks the active
party, rejects stale revisions, and prevents capacity from dropping below the current attending count.
Direct authenticated table writes remain denied. The focused `0014` pgTAP catalog suite contains five
transaction-wrapped assertions, all passing as of 2026-07-26.

That capacity check reads `public.rsvp_responses`, so **`0014` depends on `0009` at run time**.
PL/pgSQL bodies are not resolved when a function is created, so `0014` installs cleanly against a
database that lacks the table and then fails on the first real call with
`relation "public.rsvp_responses" does not exist`. Hosted Supabase is in exactly that state: `0014`
was applied on 2026-07-24 and `0009` has never been applied. The catalog suite cannot detect this
because it never invokes the RPC. Apply `0009` before `0014` on any new environment.

## Creator-authored invitation share messages

Migration `0024_invitation_share_messages.sql` adds `personal_share_message` and
`general_share_message` to `public.invitations`, plus the authenticated owner-only
`update_invitation_share_messages()` RPC behind them.

These are creator-side wording, not invitation content. They are never rendered to a guest and never
enter a publication snapshot, which is why they live on `invitations` rather than inside the
invitation document — putting them in the document would ship creator notes to the edge with every
published invitation. Null means "use the generated default", so a creator who never customises
keeps inheriting improvements to that default.

`0002` grants table-wide `select` on `public.invitations`, which covers columns added later, so
these need no column grant. That is unlike `guest_parties`, where `0012` replaced the table-wide
grant with an explicit allowlist and every new column needs its own `grant select`. `0002` grants no
`update` on `invitations` at all, so the write path is the RPC rather than a direct table write.

The RPC re-checks ownership, the 2000-character bound, the required `{link}` placeholder, and the
per-message placeholder allowlist (`{recipient}` is rejected in the general message, which addresses
everyone at once and has no single recipient). An unrecognised placeholder is rejected rather than
pasted to a guest as literal `{name}` text. The `0024` pgTAP suite has 18 assertions covering both
the catalog shape and the validation branches, including cross-workspace denial.

**Documentation gap:** this README documents `0001`–`0014` and then `0024`. Migrations `0015`–`0023`
have no sections here; see `Operations/Migration and Environment Ledger` in the Second Brain for
their canonical status.
