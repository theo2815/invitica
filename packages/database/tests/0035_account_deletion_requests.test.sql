begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(28);

-- ---------------------------------------------------------------- privileges

select ok(
  has_function_privilege(
    'authenticated', 'public.request_account_deletion(bytea, timestamptz)', 'execute'
  ),
  'authenticated creators can open a deletion request'
);
select ok(
  not has_function_privilege(
    'anon', 'public.request_account_deletion(bytea, timestamptz)', 'execute'
  ),
  'anonymous callers cannot open a deletion request'
);
select ok(
  not has_function_privilege(
    'service_role', 'public.request_account_deletion(bytea, timestamptz)', 'execute'
  ),
  'the service role cannot open a deletion request on a creator''s behalf'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.resolve_account_deletion(bytea, boolean)', 'execute'
  ),
  'authenticated creators can resolve their own deletion token'
);
select ok(
  not has_function_privilege(
    'anon', 'public.resolve_account_deletion(bytea, boolean)', 'execute'
  ),
  'anonymous callers cannot resolve a deletion token'
);
select ok(
  not has_function_privilege(
    'service_role', 'public.resolve_account_deletion(bytea, boolean)', 'execute'
  ),
  'the service role cannot resolve a deletion token'
);

-- The token hash is the whole security of the emailed link. No client role reads this table.
select ok(
  not has_table_privilege('authenticated', 'public.account_deletion_requests', 'select'),
  'creators cannot read the deletion request table'
);
select ok(
  not has_table_privilege('anon', 'public.account_deletion_requests', 'select'),
  'anonymous callers cannot read the deletion request table'
);
select ok(
  not has_table_privilege('service_role', 'public.account_deletion_requests', 'select'),
  'the service role cannot read the deletion request table'
);
select ok(
  not has_table_privilege('authenticated', 'public.account_deletion_requests', 'insert'),
  'creators cannot insert a deletion request directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.account_deletion_requests', 'update'),
  'creators cannot mark their own request confirmed directly'
);

select ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.account_deletion_requests'::regclass
  ),
  'row level security is enabled on the deletion request table'
);

select ok(
  (
    select bool_and(p.prosecdef)
    from pg_catalog.pg_proc p
    where p.oid in (
      'public.request_account_deletion(bytea, timestamptz)'::regprocedure,
      'public.resolve_account_deletion(bytea, boolean)'::regprocedure
    )
  ),
  'both deletion functions are security definer'
);
-- `set search_path = ''` is stored as the literal `search_path=""`, quotes included, which is the
-- form `0026` and `0028` already assert against.
select is(
  (
    select proconfig
    from pg_catalog.pg_proc
    where oid = 'public.request_account_deletion(bytea, timestamptz)'::regprocedure
  ),
  array['search_path=""']::text[],
  'opening a deletion request pins an empty search path'
);
select is(
  (
    select proconfig
    from pg_catalog.pg_proc
    where oid = 'public.resolve_account_deletion(bytea, boolean)'::regprocedure
  ),
  array['search_path=""']::text[],
  'resolving a deletion token pins an empty search path'
);

-- ---------------------------------------------------------------- behavior

delete from auth.users
where id in (
  'd1000000-0000-4000-8000-000000000001'::uuid,
  'd2000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'deletion-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'd2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'deletion-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.request_account_deletion(sha256('token-a'::bytea), now() + interval '30 minutes')$$,
  'a creator can open a deletion request'
);

select is(
  public.resolve_account_deletion(sha256('token-a'::bytea)),
  'valid',
  'the token just issued resolves as valid'
);

-- A token that was never issued and a token belonging to someone else must be indistinguishable.
select is(
  public.resolve_account_deletion(sha256('never-issued'::bytea)),
  'unknown',
  'a token that was never issued is unknown'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000002', true);
select is(
  public.resolve_account_deletion(sha256('token-a'::bytea)),
  'unknown',
  'another creator holding the link learns nothing from it'
);
select lives_ok(
  $$select public.request_account_deletion(sha256('token-b'::bytea), now() + interval '30 minutes')$$,
  'a second creator can open their own request'
);

set local role postgres;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);

-- Asking again replaces the request, so the link already sent stops working.
select lives_ok(
  $$select public.request_account_deletion(sha256('token-a2'::bytea), now() + interval '30 minutes')$$,
  'asking again replaces the open request'
);
select is(
  public.resolve_account_deletion(sha256('token-a'::bytea)),
  'unknown',
  'the previously emailed link stops resolving once a new one is issued'
);

select is(
  public.resolve_account_deletion(sha256('token-a2'::bytea), true),
  'claimed',
  'the current token can be claimed exactly once'
);
select is(
  public.resolve_account_deletion(sha256('token-a2'::bytea), true),
  'used',
  'claiming the same token again reports it used rather than claiming it twice'
);
select is(
  public.resolve_account_deletion(sha256('token-a2'::bytea)),
  'used',
  'a claimed token reads as used without claiming'
);

set local role postgres;
update public.account_deletion_requests
set confirmed_at = null,
    requested_at = now() - interval '2 hours',
    expires_at = now() - interval '90 minutes'
where user_id = 'd1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select is(
  public.resolve_account_deletion(sha256('token-a2'::bytea)),
  'expired',
  'a request past its expiry reports expired'
);
select is(
  public.resolve_account_deletion(sha256('token-a2'::bytea), true),
  'expired',
  'an expired request cannot be claimed'
);

-- The row goes with the account it belongs to, in the same statement that completes the deletion.
set local role postgres;
delete from auth.users where id = 'd1000000-0000-4000-8000-000000000001';
select is(
  (
    select count(*)::int
    from public.account_deletion_requests
    where user_id = 'd1000000-0000-4000-8000-000000000001'
  ),
  0,
  'deleting the account removes its deletion request by cascade'
);

delete from auth.users where id = 'd2000000-0000-4000-8000-000000000002';

select * from finish();

rollback;
