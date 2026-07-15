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

## Applying and testing

Apply migrations explicitly through the reviewed Supabase migration workflow. Do not run this SQL
automatically at application startup.

After applying the migration to a disposable local or test Supabase database with pgTAP available,
run `tests/0001_identity_tenancy.test.sql` using the project's database test runner or `psql` with
`ON_ERROR_STOP` enabled. The policy test covers RLS enablement, provisioning idempotency, anonymous
denial, cross-user read and update isolation, and membership-escalation denial.

The migration and policy tests have not been applied to the founder's hosted Supabase project from
this repository. A successful run against a compatible Supabase database is required before this
schema can be treated as deployed or operationally verified.
