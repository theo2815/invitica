# Invitica database

This package contains the reviewed PostgreSQL migrations and matching pgTAP policy/runtime tests for
Invitica. The web application never applies migrations at startup. Apply every migration explicitly,
in numeric order, through the reviewed Supabase workflow.

Hosted application state changes independently of Git, so this README documents the checked-in
contract only. The canonical applied/verified status is maintained in the Invitica Second Brain at
`Operations/Migration and Environment Ledger.md`.

## Security and ownership invariants

- `workspace_id`, backed by active workspace membership, is the creator ownership boundary.
- Untrusted invitation documents are parsed by the shared TypeScript schema before persistence or
  publication; SQL adds narrow structural and business-rule checks at mutation boundaries.
- Authenticated browser roles do not receive unbounded table or whole-document mutation access.
  Narrow RPCs derive identity from `auth.uid()` and re-check ownership. The generic
  `update_invitation_sections` RPC accepts only stable-ID patches allowed by an exact
  template-version policy.
- Privileged functions pin an empty `search_path` and grant only the roles that need the operation.
- Raw personalized-link tokens are never stored in PostgreSQL. Hashing and separately keyed recovery
  ciphertext have distinct purposes, and revocation destroys recoverable material.
- Publication snapshots are immutable. Mutable build/delivery state and the active public alias stay
  separate from the snapshot.
- Money, payments, arbitrary HTML/CSS, and executable template code are outside this schema.

## Migration inventory

| Migration | Contract added |
|---|---|
| `0001_identity_tenancy.sql` | Profiles, personal workspaces, memberships, provisioning, and base RLS |
| `0002_invitation_draft_foundation.sql` | Events, invitations, version-pinned JSONB drafts, and revisions |
| `0003_create_invitation_draft_rpc.sql` | Idempotent transactional draft creation |
| `0004_update_invitation_hero_rpc.sql` | Revision-safe constrained hero editing |
| `0005_publication_snapshot_foundation.sql` | Immutable publication snapshots, builds, versions, and aliases |
| `0006_publication_delivery_orchestration.sql` | Retry-safe delivery lifecycle and rollback-safe alias state |
| `0007_delete_unpublished_invitation.sql` | Owner deletion limited to never-published invitations |
| `0008_guest_parties_personalized_links.sql` | Guest parties, members, and hash-only personalized links |
| `0009_account_free_rsvp.sql` | Party-scoped, revision-safe account-free RSVP persistence |
| `0010_creator_dashboard_results.sql` | Privacy-minimal daily invitation-view aggregates |
| `0011_garden_promise_details.sql` | Garden Promise opening, venue, and RSVP editing boundary |
| `0012_guest_desk_management.sql` | Bulk guest creation, reversible trash, and recoverable sharing |
| `0013_guest_link_ciphertext_regex_hotfix.sql` | Correct AES-GCM ciphertext validation for `0012` |
| `0014_update_guest_party.sql` | Revision-safe guest-party and member editing |
| `0015_invitation_media_assets.sql` | Private creator image assets and publication renditions |
| `0016_little_blessings_details.sql` | Focused Little Blessings document editing |
| `0017_publication_template_widening.sql` | Named publishable-template allowlist and asset-manifest validation |
| `0018_little_blessings_empty_album.sql` | Empty hidden galleries with non-empty visible-gallery enforcement |
| `0019_public_request_throttle.sql` | Database-backed public RSVP/view request budgets |
| `0020_guest_invitation_delivery_tracking.sql` | Creator sent/copy delivery counters and state |
| `0021_little_blessings_v2_publication.sql` | Little Blessings v2 publication contract |
| `0022_template_version_upgrades.sql` | Explicit creator-confirmed draft template upgrades |
| `0023_little_blessings_v2_save.sql` | v2-aware Little Blessings saving |
| `0024_invitation_share_messages.sql` | Creator-authored personal and general share messages |
| `0025_guest_party_pagination.sql` | Owner-only bounded Guest Desk search/filter pagination |
| `0026_guest_link_batch_recovery.sql` | Ordered batched recovery for visible private-link pages |
| `0027_terms_acceptance.sql` | Append-only creator Terms acceptance with the presented Privacy Notice version |
| `0028_template_version_policy.sql` | Database-owned exact template policy, stable-ID section updates, and policy-backed publication |
| `0029_occasion_template_versions.sql` | Garden Promise, Golden Hour, and Sunday Joy v2 policies plus expanded program bounds |

Migrations are additive and sequential. Do not selectively install a later migration because its
function body appears to create successfully: PostgreSQL may defer relation resolution until the
first call. For example, `0014` reads the RSVP table introduced by `0009`.

## Applying migrations

1. Use a disposable local/test Supabase project first.
2. Apply `migrations/*.sql` in numeric order with errors stopping the run.
3. Review the resulting schema, RLS state, function security mode, and role grants.
4. Apply the same reviewed files to the intended hosted environment only with explicit authorization.
5. Record authored, applied, and independently verified state in the Migration and Environment
   Ledger; never infer deployment from a merged migration file.

Do not run migration SQL through application startup, a web request, or an automated production boot
hook. Do not place service-role credentials in browser-visible variables or repository files.

## Tests

Every migration has a numerically matching transaction-wrapped pgTAP file in `tests/`. The current
29 files declare 610 assertions across catalog shape, grants, RLS denial, cross-owner isolation,
idempotency, concurrency, document preservation, and focused runtime behavior.

Run the suites in numeric order against a disposable database with pgTAP installed, using `psql` or
the project verification workflow with `ON_ERROR_STOP` enabled. Never run these destructive fixture
suites against production or a database containing real customer data.

Known verification caveat: `0010_creator_dashboard_results.test.sql` does not yet include the standard
pgTAP bootstrap/search-path header. Until that follow-up is fixed, confirm pgTAP is loaded and verify
that all 17 planned assertions actually execute; a command that reports no assertions is not a pass.
Dated local and hosted evidence belongs in the Migration and Environment Ledger, not in this README.
