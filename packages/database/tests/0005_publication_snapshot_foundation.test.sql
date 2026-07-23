begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(48);

create function pg_temp.garden_document(p_title text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'templateVersionId', '40000000-0000-4000-8000-000000000001',
    'locale', 'en-PH',
    'eventTimezone', 'Asia/Manila',
    'theme', jsonb_build_object(
      'colors', jsonb_build_object(
        'background', '#e8eadf',
        'surface', '#fffdf6',
        'text', '#344033',
        'accent', '#687a5a',
        'accentContrast', '#ffffff'
      ),
      'typography', jsonb_build_object(
        'headingFontId', 'fraunces',
        'bodyFontId', 'instrument-sans'
      ),
      'spacingScale', 'spacious'
    ),
    'opening', jsonb_build_object(
      'preset', 'ribbon-envelope-letter',
      'motionStyle', 'elegant',
      'recipientMode', 'personalized',
      'fallbackRecipientText', 'Our dear guest'
    ),
    'sections', jsonb_build_array(
      jsonb_build_object(
        'id', 'a4000000-0000-4000-8000-000000000001',
        'type', 'hero',
        'visible', true,
        'animationPreset', 'fade-in',
        'props', jsonb_build_object('title', p_title)
      )
    ),
    'assets', jsonb_build_array()
  )
$$;

create function pg_temp.garden_snapshot(p_revision bigint, p_title text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'snapshotVersion', 1,
    'invitationSchemaVersion', 1,
    'rendererKey', 'garden-promise-v1',
    'rendererVersion', 1,
    'templateVersionId', '40000000-0000-4000-8000-000000000001',
    'templateVersion', 1,
    'draftRevision', p_revision,
    'document', pg_temp.garden_document(p_title),
    'assets', jsonb_build_array()
  )
$$;

select ok(
  has_function_privilege(
    'authenticated',
    'public.request_invitation_publication(uuid,bigint,uuid,jsonb)',
    'execute'
  ),
  'authenticated creators can execute the publication request RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.request_invitation_publication(uuid,bigint,uuid,jsonb)',
    'execute'
  ),
  'anonymous users cannot execute the publication request RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_invitation_publication(uuid,text,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.fail_invitation_publication(uuid,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.activate_invitation_publication(uuid)',
    'execute'
  ),
  'only the service publication boundary can complete, fail, and activate builds'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_invitation_publication(uuid,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.fail_invitation_publication(uuid,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.activate_invitation_publication(uuid)',
    'execute'
  ),
  'creator sessions cannot claim artifact completion or switch the active pointer'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.publication_versions'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.publication_builds'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.publication_aliases'::regclass),
  'all publication tables have row level security enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.publication_versions', 'insert')
  and not has_table_privilege('authenticated', 'public.publication_versions', 'update')
  and not has_table_privilege('authenticated', 'public.publication_versions', 'delete')
  and not has_table_privilege('authenticated', 'public.publication_builds', 'update')
  and not has_table_privilege('authenticated', 'public.publication_aliases', 'update'),
  'authenticated sessions cannot mutate publication records directly'
);

delete from auth.users
where id in (
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'a2000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'publication-user-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'publication-user-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User A can provision a personal workspace'
);
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'a3000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Garden Promise publication test',
      'wedding',
      'Asia/Manila',
      'en-PH',
      pg_temp.garden_document('Mara & Joaquin')
    )
  $create$,
  'User A can create the Garden Promise draft used by publication tests'
);
select lives_ok(
  $request$
    select set_config(
      'test.publication_one',
      public.request_invitation_publication(
        'a3000000-0000-4000-8000-000000000001',
        1,
        'a5000000-0000-4000-8000-000000000001',
        pg_temp.garden_snapshot(1, 'Mara & Joaquin')
      )::text,
      true
    )
  $request$,
  'an active owner can request a pinned publication for the expected draft revision'
);
select is(
  (select count(*) from public.publication_versions),
  1::bigint,
  'the first request creates one immutable publication version'
);
select is(
  (
    select status
    from public.publication_builds
    where publication_id = current_setting('test.publication_one')::uuid
  ),
  'pending',
  'a new publication starts with a separate pending build'
);
select is(
  (select count(*) from public.publication_aliases),
  1::bigint,
  'the first request creates one stable alias'
);
select is(
  (
    select active_publication_id
    from public.publication_aliases
    where invitation_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  null::uuid,
  'a pending publication is not active'
);
select ok(
  (
    select snapshot_version = 1
      and invitation_schema_version = 1
      and renderer_key = 'garden-promise-v1'
      and renderer_version = 1
      and template_version_id = '40000000-0000-4000-8000-000000000001'
      and template_version = 1
      and draft_revision = 1
      and snapshot = pg_temp.garden_snapshot(1, 'Mara & Joaquin')
    from public.publication_versions
    where id = current_setting('test.publication_one')::uuid
  ),
  'the publication stores every schema, renderer, template, revision, content, and asset pin'
);
select ok(
  (
    select public_identifier ~ '^[0-9a-f]{32}$'
    from public.publication_aliases
    where invitation_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  'the unlisted alias contains 128 bits of random identifier material'
);
select is(
  public.request_invitation_publication(
    'a3000000-0000-4000-8000-000000000001',
    1,
    'a5000000-0000-4000-8000-000000000001',
    pg_temp.garden_snapshot(1, 'Mara & Joaquin')
  ),
  current_setting('test.publication_one')::uuid,
  'an identical retry returns the original publication'
);
select is(
  (select count(*) from public.publication_versions),
  1::bigint,
  'an identical retry creates no duplicate version'
);
select throws_ok(
  $conflict$
    select public.request_invitation_publication(
      'a3000000-0000-4000-8000-000000000001',
      1,
      'a5000000-0000-4000-8000-000000000001',
      jsonb_set(
        pg_temp.garden_snapshot(1, 'Mara & Joaquin'),
        '{document,sections,0,props,title}',
        '"Different content"'::jsonb
      )
    )
  $conflict$,
  '22023', null, 'conflicting reuse of a publication idempotency key is rejected'
);
select throws_ok(
  $stale$
    select public.request_invitation_publication(
      'a3000000-0000-4000-8000-000000000001',
      2,
      'a5000000-0000-4000-8000-000000000002',
      pg_temp.garden_snapshot(2, 'Mara & Joaquin')
    )
  $stale$,
  '40001', null, 'a stale or future expected draft revision is rejected'
);
select throws_ok(
  $renderer$
    select public.request_invitation_publication(
      'a3000000-0000-4000-8000-000000000001',
      1,
      'a5000000-0000-4000-8000-000000000003',
      jsonb_set(
        pg_temp.garden_snapshot(1, 'Mara & Joaquin'),
        '{rendererKey}',
        '"remote-code-v1"'::jsonb
      )
    )
  $renderer$,
  '22023', null, 'a renderer outside the supported Garden Promise pin is rejected'
);
select throws_ok(
  $null_snapshot$
    select public.request_invitation_publication(
      'a3000000-0000-4000-8000-000000000001',
      1,
      'a5000000-0000-4000-8000-000000000008',
      null
    )
  $null_snapshot$,
  '22023', null, 'a missing publication snapshot is rejected'
);

set local role postgres;
select throws_ok(
  format(
    'update public.publication_versions set draft_revision = 2 where id = %L',
    current_setting('test.publication_one')
  ),
  '55000', null, 'publication version rows cannot be changed after creation'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  format(
    'update public.publication_builds set status = %L where publication_id = %L',
    'failed',
    current_setting('test.publication_one')
  ),
  '42501', null, 'creators cannot bypass the publication lifecycle RPCs'
);

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User B can provision a separate personal workspace'
);
select throws_ok(
  $cross$
    select public.request_invitation_publication(
      'a3000000-0000-4000-8000-000000000001',
      1,
      'a5000000-0000-4000-8000-000000000004',
      pg_temp.garden_snapshot(1, 'Mara & Joaquin')
    )
  $cross$,
  'P0002', null, 'another workspace cannot request publication for User A draft'
);
select is(
  (select count(*) from public.publication_versions),
  0::bigint,
  'RLS hides publication versions from another workspace'
);
select is(
  (select count(*) from public.publication_aliases),
  0::bigint,
  'RLS hides publication aliases from another workspace'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $anonymous$
    select public.request_invitation_publication(
      'a3000000-0000-4000-8000-000000000001',
      1,
      'a5000000-0000-4000-8000-000000000005',
      pg_temp.garden_snapshot(1, 'Mara & Joaquin')
    )
  $anonymous$,
  '42501', null, 'anonymous publication requests are denied'
);

set local role service_role;
select throws_ok(
  format(
    'select public.complete_invitation_publication(%L, %L, null)',
    current_setting('test.publication_one'),
    'publications/a3000000/version-1.json'
  ),
  '22023', null, 'a publication cannot complete without an artifact checksum'
);
select lives_ok(
  format(
    'select public.complete_invitation_publication(%L, %L, %L)',
    current_setting('test.publication_one'),
    'publications/a3000000/version-1.json',
    repeat('a', 64)
  ),
  'the service boundary can mark a persisted artifact complete'
);
select is(
  (
    select status
    from public.publication_builds
    where publication_id = current_setting('test.publication_one')::uuid
  ),
  'completed',
  'artifact completion changes only the separate build state'
);
select is(
  public.activate_invitation_publication(current_setting('test.publication_one')::uuid),
  (
    select public_identifier
    from public.publication_aliases
    where invitation_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  'a completed publication can atomically activate its stable alias'
);
select is(
  (
    select active_publication_id
    from public.publication_aliases
    where invitation_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  current_setting('test.publication_one')::uuid,
  'the first completed publication is now active'
);

set local role postgres;
update public.invitation_drafts
set
  document = pg_temp.garden_document('Lira & Mateo'),
  revision = 2
where invitation_id = 'a3000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $request$
    select set_config(
      'test.publication_two',
      public.request_invitation_publication(
        'a3000000-0000-4000-8000-000000000001',
        2,
        'a5000000-0000-4000-8000-000000000006',
        pg_temp.garden_snapshot(2, 'Lira & Mateo')
      )::text,
      true
    )
  $request$,
  'a later draft revision creates a retained second publication version'
);

set local role service_role;
select lives_ok(
  format(
    'select public.fail_invitation_publication(%L, %L)',
    current_setting('test.publication_two'),
    'artifact_write_failed'
  ),
  'the service boundary can mark a new publication failed'
);
select is(
  (
    select status
    from public.publication_builds
    where publication_id = current_setting('test.publication_two')::uuid
  ),
  'failed',
  'the failed build retains a narrow non-sensitive failure code'
);
select throws_ok(
  format(
    'select public.activate_invitation_publication(%L)',
    current_setting('test.publication_two')
  ),
  '55000', null, 'a failed publication cannot become active'
);
select is(
  (
    select active_publication_id
    from public.publication_aliases
    where invitation_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  current_setting('test.publication_one')::uuid,
  'a failed newer publication leaves the existing active pointer unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select is(
  public.request_invitation_publication(
    'a3000000-0000-4000-8000-000000000001',
    2,
    'a5000000-0000-4000-8000-000000000007',
    pg_temp.garden_snapshot(2, 'Lira & Mateo')
  ),
  current_setting('test.publication_two')::uuid,
  'a new idempotency key reuses the publication for the same draft revision'
);
select set_config('test.publication_three', current_setting('test.publication_two'), true);

set local role service_role;
select lives_ok(
  format(
    'select public.start_invitation_publication(%L)',
    current_setting('test.publication_three')
  ),
  'a failed build can restart through the service boundary'
);
select lives_ok(
  format(
    'select public.complete_invitation_publication(%L, %L, %L)',
    current_setting('test.publication_three'),
    'publications/a3000000/version-3.json',
    repeat('b', 64)
  ),
  'the replacement publication can complete independently'
);
select lives_ok(
  format(
    'select public.activate_invitation_publication(%L)',
    current_setting('test.publication_three')
  ),
  'activating the completed replacement switches one narrow pointer'
);
select is(
  (
    select active_publication_id
    from public.publication_aliases
    where invitation_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  current_setting('test.publication_three')::uuid,
  'the completed replacement becomes active'
);
select lives_ok(
  format(
    'select public.activate_invitation_publication(%L)',
    current_setting('test.publication_one')
  ),
  'a retained completed publication can be reactivated for rollback'
);
select is(
  (
    select active_publication_id
    from public.publication_aliases
    where invitation_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  current_setting('test.publication_one')::uuid,
  'rollback restores the earlier completed publication'
);
select is(
  (select count(*) from public.publication_versions),
  2::bigint,
  'activation and rollback retain every immutable publication version'
);
select is(
  (select count(*) from public.publication_aliases),
  1::bigint,
  'all publication versions continue to share one stable alias'
);
select ok(
  (
    select count(*) = 2
      and count(*) filter (where status = 'completed') = 2
      and count(*) filter (where status = 'failed') = 0
    from public.publication_builds
  ),
  'retried builds complete without duplicating immutable versions'
);

set local role postgres;
select * from finish();

delete from auth.users
where id in (
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'a2000000-0000-4000-8000-000000000002'::uuid
);

rollback;
