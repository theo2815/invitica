begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(36);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  'events has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.invitations'::regclass),
  'invitations has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.invitation_drafts'::regclass),
  'invitation_drafts has row-level security enabled'
);

delete from auth.users
where id in (
  '31000000-0000-4000-8000-000000000001'::uuid,
  '32000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '31000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'draft-foundation-user-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '32000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'draft-foundation-user-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.ensure_personal_workspace()$$, 'User A can provision a personal workspace');

set local role postgres;
select set_config(
  'test.draft_user_a_workspace',
  (select id::text from public.workspaces where personal_owner_user_id = '31000000-0000-4000-8000-000000000001'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '32000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.ensure_personal_workspace()$$, 'User B can provision a separate personal workspace');

set local role postgres;
select set_config(
  'test.draft_user_b_workspace',
  (select id::text from public.workspaces where personal_owner_user_id = '32000000-0000-4000-8000-000000000002'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '32000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.events (id, workspace_id, name, occasion)
    values (
      '42000000-0000-4000-8000-000000000001',
      current_setting('test.draft_user_b_workspace')::uuid,
      'User B event',
      'wedding'
    )
  $$,
  'User B can create an event in their workspace'
);
select lives_ok(
  $$
    insert into public.invitations (id, workspace_id, event_id, template_version_id)
    values (
      '52000000-0000-4000-8000-000000000001',
      current_setting('test.draft_user_b_workspace')::uuid,
      '42000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  'User B can create an invitation for their event'
);
select lives_ok(
  $$
    insert into public.invitation_drafts (invitation_id, workspace_id, template_version_id, document)
    values (
      '52000000-0000-4000-8000-000000000001',
      current_setting('test.draft_user_b_workspace')::uuid,
      '40000000-0000-4000-8000-000000000001',
      '{"schemaVersion":1,"templateVersionId":"40000000-0000-4000-8000-000000000001"}'::jsonb
    )
  $$,
  'User B can create the current draft for their invitation'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.events (id, workspace_id, name, occasion, starts_at, ends_at)
    values (
      '41000000-0000-4000-8000-000000000001',
      current_setting('test.draft_user_a_workspace')::uuid,
      'User A event',
      'wedding',
      '2027-02-14 07:00:00+00',
      '2027-02-14 12:00:00+00'
    )
  $$,
  'User A can create an event in their workspace'
);
select lives_ok(
  $$
    insert into public.invitations (id, workspace_id, event_id, template_version_id)
    values
      ('51000000-0000-4000-8000-000000000001', current_setting('test.draft_user_a_workspace')::uuid, '41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
      ('51000000-0000-4000-8000-000000000002', current_setting('test.draft_user_a_workspace')::uuid, '41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
      ('51000000-0000-4000-8000-000000000003', current_setting('test.draft_user_a_workspace')::uuid, '41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
      ('51000000-0000-4000-8000-000000000004', current_setting('test.draft_user_a_workspace')::uuid, '41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
      ('51000000-0000-4000-8000-000000000005', current_setting('test.draft_user_a_workspace')::uuid, '41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001')
  $$,
  'User A can create draft invitations pinned to Garden Promise v1'
);
select lives_ok(
  $$
    insert into public.invitation_drafts (invitation_id, workspace_id, template_version_id, document)
    values (
      '51000000-0000-4000-8000-000000000001',
      current_setting('test.draft_user_a_workspace')::uuid,
      '40000000-0000-4000-8000-000000000001',
      '{"schemaVersion":1,"templateVersionId":"40000000-0000-4000-8000-000000000001"}'::jsonb
    )
  $$,
  'User A can create a revision-one current draft'
);

select is((select count(*) from public.events), 1::bigint, 'User A reads only their event');
select is((select count(*) from public.invitations), 5::bigint, 'User A reads only their invitations');
select is((select count(*) from public.invitation_drafts), 1::bigint, 'User A reads only their current draft');

with updated as (
  update public.events
  set name = 'Updated User A event'
  where id = '41000000-0000-4000-8000-000000000001'
  returning 1
)
select is((select count(*) from updated), 1::bigint, 'User A can update their event');

set local role postgres;
select lives_ok(
  $$
    update public.invitation_drafts
    set
      revision = 2,
      document = '{"schemaVersion":1,"templateVersionId":"40000000-0000-4000-8000-000000000001","content":{"title":"Updated"}}'::jsonb
    where invitation_id = '51000000-0000-4000-8000-000000000001'
  $$,
  'User A can save the next draft revision'
);
select is(
  (select revision from public.invitation_drafts where invitation_id = '51000000-0000-4000-8000-000000000001'),
  2::bigint,
  'the saved draft revision is incremented'
);

set local role authenticated;

select is(
  (select count(*) from public.events where id = '42000000-0000-4000-8000-000000000001'),
  0::bigint,
  'User A cannot read User B event'
);
select is(
  (select count(*) from public.invitations where id = '52000000-0000-4000-8000-000000000001'),
  0::bigint,
  'User A cannot read User B invitation'
);
select is(
  (select count(*) from public.invitation_drafts where invitation_id = '52000000-0000-4000-8000-000000000001'),
  0::bigint,
  'User A cannot read User B draft'
);
with updated as (
  update public.events set name = 'Compromised'
  where id = '42000000-0000-4000-8000-000000000001'
  returning 1
)
select is((select count(*) from updated), 0::bigint, 'User A cannot update User B event');
select throws_ok(
  $$
    update public.invitation_drafts
    set revision = 2,
        document = jsonb_build_object(
          'schemaVersion', 1,
          'templateVersionId', '40000000-0000-4000-8000-000000000001'
        )
    where invitation_id = '52000000-0000-4000-8000-000000000001'
  $$,
  '42501', null, 'User A cannot update User B draft directly'
);

select throws_ok(
  format(
    'insert into public.events (workspace_id, name, occasion) values (%L::uuid, %L, %L)',
    current_setting('test.draft_user_b_workspace'), 'Cross-workspace event', 'wedding'
  ),
  '42501', null, 'User A cannot create an event in User B workspace'
);
select throws_ok(
  $$
    insert into public.invitations (id, workspace_id, event_id, template_version_id)
    values (
      '51000000-0000-4000-8000-000000000006',
      current_setting('test.draft_user_a_workspace')::uuid,
      '42000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  '23503', null, 'an invitation cannot reference an event from another workspace'
);

select throws_ok(
  $$
    insert into public.invitation_drafts (invitation_id, workspace_id, template_version_id, document)
    values (
      '51000000-0000-4000-8000-000000000002',
      current_setting('test.draft_user_a_workspace')::uuid,
      '40000000-0000-4000-8000-000000000001',
      '[]'::jsonb
    )
  $$,
  '23514', null, 'a draft document must be a JSON object'
);
select throws_ok(
  $$
    insert into public.invitation_drafts (invitation_id, workspace_id, template_version_id, document)
    values (
      '51000000-0000-4000-8000-000000000003',
      current_setting('test.draft_user_a_workspace')::uuid,
      '40000000-0000-4000-8000-000000000001',
      '{"schemaVersion":2,"templateVersionId":"40000000-0000-4000-8000-000000000001"}'::jsonb
    )
  $$,
  '23514', null, 'a current draft must use invitation schema version 1'
);
select throws_ok(
  $$
    insert into public.invitation_drafts (invitation_id, workspace_id, template_version_id, document)
    values (
      '51000000-0000-4000-8000-000000000004',
      current_setting('test.draft_user_a_workspace')::uuid,
      '40000000-0000-4000-8000-000000000001',
      '{"schemaVersion":1,"templateVersionId":"40000000-0000-4000-8000-000000000099"}'::jsonb
    )
  $$,
  '23514', null, 'a draft document must match its pinned template version'
);
select throws_ok(
  $$
    insert into public.invitation_drafts (invitation_id, workspace_id, template_version_id, revision, document)
    values (
      '51000000-0000-4000-8000-000000000005',
      current_setting('test.draft_user_a_workspace')::uuid,
      '40000000-0000-4000-8000-000000000001',
      2,
      '{"schemaVersion":1,"templateVersionId":"40000000-0000-4000-8000-000000000001"}'::jsonb
    )
  $$,
  '23514', null, 'a new draft cannot skip revision 1'
);

set local role postgres;
select throws_ok(
  $$
    update public.invitation_drafts
    set revision = 4
    where invitation_id = '51000000-0000-4000-8000-000000000001'
  $$,
  '23514', null, 'an existing draft revision must increase by exactly one'
);

set local role authenticated;
select throws_ok(
  $$
    update public.invitations
    set template_version_id = '40000000-0000-4000-8000-000000000099'
    where id = '51000000-0000-4000-8000-000000000001'
  $$,
  '42501', null, 'authenticated users cannot mutate an invitation template pin directly'
);
select throws_ok(
  $$delete from public.events where id = '41000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'authenticated users cannot delete events directly'
);

set local role postgres;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok($$select * from public.events$$, '42501', null, 'anonymous users cannot read events');
select throws_ok($$select * from public.invitations$$, '42501', null, 'anonymous users cannot read invitations');
select throws_ok($$select * from public.invitation_drafts$$, '42501', null, 'anonymous users cannot read invitation drafts');
select throws_ok(
  $$insert into public.events (workspace_id, name, occasion) values (gen_random_uuid(), 'Anonymous event', 'wedding')$$,
  '42501', null, 'anonymous users cannot create events'
);
select throws_ok(
  $$
    insert into public.invitation_drafts (invitation_id, workspace_id, template_version_id, document)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '{}'::jsonb)
  $$,
  '42501', null, 'anonymous users cannot create invitation drafts'
);

set local role postgres;
select * from finish();
rollback;
