begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(13);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_invitation_draft(uuid,uuid,text,text,text,text,jsonb)',
    'execute'
  ),
  'authenticated creators can execute the draft creation RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_invitation_draft(uuid,uuid,text,text,text,text,jsonb)',
    'execute'
  ),
  'anonymous users cannot execute the draft creation RPC'
);

delete from auth.users
where id in (
  '61000000-0000-4000-8000-000000000001'::uuid,
  '62000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '61000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'draft-rpc-user-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '62000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'draft-rpc-user-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.ensure_personal_workspace();

select lives_ok(
  $$
    select public.create_invitation_draft(
      '71000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Garden Promise invitation',
      'wedding',
      'Asia/Manila',
      'en-PH',
      '{"schemaVersion":1,"templateVersionId":"40000000-0000-4000-8000-000000000001"}'::jsonb
    )
  $$,
  'an authenticated creator can create an initial invitation draft atomically'
);

select is((select count(*) from public.events), 1::bigint, 'creation inserts one event');
select is((select count(*) from public.invitations), 1::bigint, 'creation inserts one invitation');
select is((select count(*) from public.invitation_drafts), 1::bigint, 'creation inserts one draft');
select is(
  (select revision from public.invitation_drafts where invitation_id = '71000000-0000-4000-8000-000000000001'),
  1::bigint,
  'the initial draft starts at revision one'
);

select is(
  public.create_invitation_draft(
    '71000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Garden Promise invitation',
    'wedding',
    'Asia/Manila',
    'en-PH',
    '{"schemaVersion":1,"templateVersionId":"40000000-0000-4000-8000-000000000001"}'::jsonb
  ),
  '71000000-0000-4000-8000-000000000001'::uuid,
  'repeating the same request returns the existing invitation'
);
select is((select count(*) from public.events), 1::bigint, 'an identical retry creates no extra event');

select throws_ok(
  $$
    select public.create_invitation_draft(
      '71000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'A different event name',
      'wedding',
      'Asia/Manila',
      'en-PH',
      '{"schemaVersion":1,"templateVersionId":"40000000-0000-4000-8000-000000000001"}'::jsonb
    )
  $$,
  '22023', null, 'a creation key cannot be reused with different input'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '62000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.ensure_personal_workspace();

select throws_ok(
  $$
    select public.create_invitation_draft(
      '71000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Garden Promise invitation',
      'wedding',
      'Asia/Manila',
      'en-PH',
      '{"schemaVersion":1,"templateVersionId":"40000000-0000-4000-8000-000000000001"}'::jsonb
    )
  $$,
  '23505', null, 'another workspace cannot claim an existing invitation identifier'
);
select is((select count(*) from public.events), 0::bigint, 'a failed cross-workspace collision leaves no event');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$
    select public.create_invitation_draft(
      '71000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001',
      'Anonymous event',
      'wedding',
      'Asia/Manila',
      'en-PH',
      '{"schemaVersion":1,"templateVersionId":"40000000-0000-4000-8000-000000000001"}'::jsonb
    )
  $$,
  '42501', null, 'anonymous draft creation is denied'
);

set local role postgres;
select * from finish();

delete from auth.users
where id in (
  '61000000-0000-4000-8000-000000000001'::uuid,
  '62000000-0000-4000-8000-000000000002'::uuid
);

rollback;
