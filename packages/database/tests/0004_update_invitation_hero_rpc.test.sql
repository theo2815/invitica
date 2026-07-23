begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(18);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_invitation_hero(uuid,bigint,text,text,text)',
    'execute'
  ),
  'authenticated creators can execute the constrained hero update RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.update_invitation_hero(uuid,bigint,text,text,text)',
    'execute'
  ),
  'anonymous users cannot execute the constrained hero update RPC'
);
select ok(
  not has_column_privilege('authenticated', 'public.invitation_drafts', 'document', 'update')
    and not has_column_privilege('authenticated', 'public.invitation_drafts', 'revision', 'update'),
  'authenticated users cannot update draft documents or revisions directly'
);

delete from auth.users
where id in (
  '81000000-0000-4000-8000-000000000001'::uuid,
  '82000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'hero-editor-user-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '82000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'hero-editor-user-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User A can provision a personal workspace'
);

select lives_ok(
  $create$
    select public.create_invitation_draft(
      '83000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Garden Promise invitation',
      'wedding',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000001',
        'sections', jsonb_build_array(
          jsonb_build_object(
            'id', '84000000-0000-4000-8000-000000000001',
            'type', 'hero',
            'visible', true,
            'animationPreset', 'fade-in',
            'props', jsonb_build_object(
              'title', 'Mara & Joaquin',
              'subtitle', 'Invite you to celebrate',
              'dateLabel', 'January 17, 2027'
            )
          ),
          jsonb_build_object(
            'id', '84000000-0000-4000-8000-000000000002',
            'type', 'message',
            'visible', true,
            'animationPreset', 'fade-up',
            'props', jsonb_build_object('body', 'A message that must remain unchanged.')
          )
        )
      )
    )
  $create$,
  'User A can create the draft used by the hero editor test'
);

select is(
  public.update_invitation_hero(
    '83000000-0000-4000-8000-000000000001',
    1,
    '  Lira & Mateo  ',
    '   ',
    null
  ),
  2::bigint,
  'a matching revision saves the constrained hero fields and returns revision two'
);
select is(
  (
    select document #>> '{sections,0,props,title}'
    from public.invitation_drafts
    where invitation_id = '83000000-0000-4000-8000-000000000001'
  ),
  'Lira & Mateo',
  'the saved hero title is trimmed'
);
select ok(
  (
    select not (document #> '{sections,0,props}' ? 'subtitle')
    from public.invitation_drafts
    where invitation_id = '83000000-0000-4000-8000-000000000001'
  ),
  'a blank optional subtitle is removed instead of stored as null'
);
select ok(
  (
    select not (document #> '{sections,0,props}' ? 'dateLabel')
    from public.invitation_drafts
    where invitation_id = '83000000-0000-4000-8000-000000000001'
  ),
  'an omitted optional date label is removed instead of stored as null'
);
select is(
  (
    select document #>> '{sections,1,props,body}'
    from public.invitation_drafts
    where invitation_id = '83000000-0000-4000-8000-000000000001'
  ),
  'A message that must remain unchanged.',
  'saving the hero leaves non-hero sections unchanged'
);

select throws_ok(
  $$
    select public.update_invitation_hero(
      '83000000-0000-4000-8000-000000000001',
      1,
      'Stale overwrite',
      null,
      null
    )
  $$,
  '40001', null, 'a stale revision cannot overwrite the saved draft'
);
select is(
  (
    select revision
    from public.invitation_drafts
    where invitation_id = '83000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'a rejected stale save does not increment the revision'
);
select throws_ok(
  $$
    select public.update_invitation_hero(
      '83000000-0000-4000-8000-000000000001',
      2,
      '   ',
      null,
      null
    )
  $$,
  '22023', null, 'a blank required hero title is rejected'
);
select throws_ok(
  $$
    select public.update_invitation_hero(
      '83000000-0000-4000-8000-000000000001',
      null,
      'Missing revision',
      null,
      null
    )
  $$,
  '22023', null, 'a missing expected revision is rejected'
);
select throws_ok(
  $$
    update public.invitation_drafts
    set revision = 3
    where invitation_id = '83000000-0000-4000-8000-000000000001'
  $$,
  '42501', null, 'an authenticated creator cannot bypass the save RPC with a direct update'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User B can provision a separate personal workspace'
);
select throws_ok(
  $$
    select public.update_invitation_hero(
      '83000000-0000-4000-8000-000000000001',
      2,
      'Cross-workspace overwrite',
      null,
      null
    )
  $$,
  'P0002', null, 'another workspace cannot update User A draft'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$
    select public.update_invitation_hero(
      '83000000-0000-4000-8000-000000000001',
      2,
      'Anonymous overwrite',
      null,
      null
    )
  $$,
  '42501', null, 'anonymous hero updates are denied'
);

set local role postgres;
select * from finish();
rollback;
