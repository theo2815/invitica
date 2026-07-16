begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(22);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.workspaces'::regclass),
  'workspaces has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.workspace_members'::regclass),
  'workspace_members has row-level security enabled'
);

delete from auth.users
where id in (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'database-policy-user-a@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'database-policy-user-b@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User A can provision a personal workspace'
);
select is(
  public.ensure_personal_workspace(),
  public.ensure_personal_workspace(),
  'personal workspace provisioning is idempotent'
);
select is(
  (select count(*) from public.profiles),
  1::bigint,
  'User A sees only their profile'
);
select is(
  (select count(*) from public.workspaces),
  1::bigint,
  'User A sees their personal workspace'
);
select is(
  (select count(*) from public.workspace_members),
  1::bigint,
  'User A sees their active owner membership'
);
with updated as (
  update public.profiles
  set display_name = 'User A'
  returning 1
)
select is(
  (select count(*) from updated),
  1::bigint,
  'User A can update their profile display name'
);
with updated as (
  update public.workspaces
  set name = 'User A workspace'
  returning 1
)
select is(
  (select count(*) from updated),
  1::bigint,
  'an active owner can update their workspace name'
);

set local role postgres;
select set_config(
  'test.user_a_workspace',
  (
    select id::text
    from public.workspaces
    where personal_owner_user_id = '10000000-0000-4000-8000-000000000001'
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User B can provision a separate personal workspace'
);

set local role postgres;
select set_config(
  'test.user_b_workspace',
  (
    select id::text
    from public.workspaces
    where personal_owner_user_id = '20000000-0000-4000-8000-000000000002'
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)
    from public.profiles
    where id = '20000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'User A cannot read User B profile'
);
with updated as (
  update public.profiles
  set display_name = 'Compromised'
  where id = '20000000-0000-4000-8000-000000000002'
  returning 1
)
select is(
  (select count(*) from updated),
  0::bigint,
  'User A cannot update User B profile'
);
select is(
  (
    select count(*)
    from public.workspaces
    where id = current_setting('test.user_b_workspace')::uuid
  ),
  0::bigint,
  'User A cannot read User B workspace'
);
with updated as (
  update public.workspaces
  set name = 'Compromised'
  where id = current_setting('test.user_b_workspace')::uuid
  returning 1
)
select is(
  (select count(*) from updated),
  0::bigint,
  'User A cannot update User B workspace'
);
select is(
  (
    select count(*)
    from public.workspace_members
    where user_id = '20000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'User A cannot read User B membership'
);
select throws_ok(
  $$
    update public.workspace_members
    set role = 'admin'
    where user_id = '10000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'authenticated users cannot escalate their membership role'
);
select throws_ok(
  format(
    'insert into public.workspace_members (workspace_id, user_id) values (%L, %L)',
    current_setting('test.user_b_workspace'),
    '10000000-0000-4000-8000-000000000001'
  ),
  '42501',
  null,
  'authenticated users cannot create memberships'
);

set local role postgres;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$select * from public.profiles$$,
  '42501',
  null,
  'anonymous users cannot read profiles'
);
select throws_ok(
  $$select * from public.workspaces$$,
  '42501',
  null,
  'anonymous users cannot read workspaces'
);
select throws_ok(
  $$select * from public.workspace_members$$,
  '42501',
  null,
  'anonymous users cannot read memberships'
);
select throws_ok(
  $$select public.ensure_personal_workspace()$$,
  '42501',
  null,
  'anonymous users cannot provision a workspace'
);

set local role postgres;
select * from finish();
rollback;
