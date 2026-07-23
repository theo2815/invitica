begin;

select plan(17);

select has_table(
  'public',
  'invitation_view_daily',
  'daily invitation view aggregates exist'
);
select columns_are(
  'public',
  'invitation_view_daily',
  array['workspace_id', 'invitation_id', 'viewed_on', 'view_count', 'last_viewed_at'],
  'view aggregates store no request, device, capability, or guest identity fields'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.invitation_view_daily'::regclass),
  'RLS is enabled on daily view aggregates'
);
select ok(
  has_function_privilege('service_role', 'public.record_invitation_view(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_invitation_view(text)', 'execute')
  and not has_function_privilege('anon', 'public.record_invitation_view(text)', 'execute'),
  'only the service boundary can record invitation views'
);
select ok(
  has_table_privilege('authenticated', 'public.invitation_view_daily', 'select')
  and not has_table_privilege('authenticated', 'public.invitation_view_daily', 'insert')
  and not has_table_privilege('authenticated', 'public.invitation_view_daily', 'update')
  and not has_table_privilege('anon', 'public.invitation_view_daily', 'select'),
  'creators receive owner-filtered reads without browser writes'
);

delete from auth.users
where id in (
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'view-owner-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'e2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'view-owner-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.ensure_personal_workspace()$$, 'User A provisions a workspace');

set local role postgres;
insert into public.events (id, workspace_id, name, occasion)
select
  'e3000000-0000-4000-8000-000000000001',
  workspaces.id,
  'Fictional view event',
  'wedding'
from public.workspaces
where personal_owner_user_id = 'e1000000-0000-4000-8000-000000000001';

insert into public.invitations (id, workspace_id, event_id, template_version_id)
select
  'e4000000-0000-4000-8000-000000000001',
  events.workspace_id,
  events.id,
  'e5000000-0000-4000-8000-000000000001'
from public.events
where id = 'e3000000-0000-4000-8000-000000000001';

insert into public.publication_versions (
  id,
  workspace_id,
  invitation_id,
  publication_number,
  idempotency_key,
  snapshot_version,
  invitation_schema_version,
  renderer_key,
  renderer_version,
  template_version_id,
  template_version,
  draft_revision,
  snapshot
)
select
  'e6000000-0000-4000-8000-000000000001',
  invitations.workspace_id,
  invitations.id,
  1,
  'e7000000-0000-4000-8000-000000000001',
  1,
  1,
  'garden-promise',
  1,
  invitations.template_version_id,
  1,
  1,
  jsonb_build_object(
    'snapshotVersion', 1,
    'invitationSchemaVersion', 1,
    'rendererKey', 'garden-promise',
    'rendererVersion', 1,
    'templateVersionId', invitations.template_version_id,
    'templateVersion', 1,
    'draftRevision', 1,
    'document', jsonb_build_object(
      'schemaVersion', 1,
      'templateVersionId', invitations.template_version_id
    ),
    'assets', '[]'::jsonb
  )
from public.invitations
where id = 'e4000000-0000-4000-8000-000000000001';

insert into public.publication_aliases (
  id,
  workspace_id,
  invitation_id,
  public_identifier,
  active_publication_id,
  delivered_publication_id,
  delivery_status,
  delivered_at
)
select
  'e8000000-0000-4000-8000-000000000001',
  publication_versions.workspace_id,
  publication_versions.invitation_id,
  'abcdefabcdefabcdefabcdefabcdefab',
  publication_versions.id,
  publication_versions.id,
  'delivered',
  now()
from public.publication_versions
where id = 'e6000000-0000-4000-8000-000000000001';

set local role service_role;
select is(
  public.record_invitation_view('not-an-identifier'),
  false,
  'malformed identifiers are ignored'
);
select is(
  public.record_invitation_view('ffffffffffffffffffffffffffffffff'),
  false,
  'unknown identifiers are ignored without creating an aggregate'
);
select is(
  public.record_invitation_view('abcdefabcdefabcdefabcdefabcdefab'),
  true,
  'a delivered invitation view is recorded'
);
select is(
  public.record_invitation_view('abcdefabcdefabcdefabcdefabcdefab'),
  true,
  'a repeat delivered invitation view is recorded'
);

set local role postgres;
select is(
  (select count(*) from public.invitation_view_daily),
  1::bigint,
  'repeat views aggregate into one invitation-day row'
);
select is(
  (select view_count from public.invitation_view_daily),
  2::bigint,
  'the daily aggregate counts repeat page loads'
);
select ok(
  (select last_viewed_at is not null from public.invitation_view_daily),
  'the aggregate retains its last successful view time'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select sum(view_count) from public.invitation_view_daily),
  2::numeric,
  'the owning creator can read the aggregate'
);
select throws_ok(
  $$insert into public.invitation_view_daily (
    workspace_id, invitation_id, viewed_on, view_count, last_viewed_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    current_date,
    1,
    now()
  )$$,
  '42501',
  null,
  'the creator cannot write view aggregates directly'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.ensure_personal_workspace()$$, 'User B provisions an isolated workspace');
select is(
  (select count(*) from public.invitation_view_daily),
  0::bigint,
  'another workspace cannot read User A view aggregates'
);

select * from finish();
rollback;
