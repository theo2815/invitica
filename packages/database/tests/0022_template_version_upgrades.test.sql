begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(14);

select ok(
  has_function_privilege(
    'authenticated',
    'public.upgrade_invitation_template(uuid,bigint,uuid,uuid,jsonb)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.upgrade_invitation_template(uuid,bigint,uuid,uuid,jsonb)',
      'execute'
    ),
  'only authenticated creators may request a template upgrade'
);

delete from auth.users where id = 'e1000000-0000-4000-8000-000000000001'::uuid;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'template-upgrade@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'the upgrading creator has a personal workspace'
);

select lives_ok(
  $create$
    select public.create_invitation_draft(
      'e2000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000004',
      'Little Blessings invitation',
      'christening',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000004',
        'locale', 'en-PH',
        'eventTimezone', 'Asia/Manila',
        'theme', jsonb_build_object('creatorColor', '#123456'),
        'opening', jsonb_build_object('fallbackRecipientText', 'Our family guest'),
        'sections', jsonb_build_array(),
        'assets', jsonb_build_array()
      )
    )
  $create$,
  'a v1 draft with creator-owned fields can be created'
);

select lives_ok(
  $publish$
    select public.request_invitation_publication(
      'e2000000-0000-4000-8000-000000000001',
      1,
      'e5000000-0000-4000-8000-000000000001',
      (
        select jsonb_build_object(
          'snapshotVersion', 1,
          'invitationSchemaVersion', 1,
          'rendererKey', 'little-blessings-v1',
          'rendererVersion', 1,
          'templateVersionId', invitation_drafts.template_version_id,
          'templateVersion', 1,
          'draftRevision', invitation_drafts.revision,
          'document', invitation_drafts.document,
          'assets', jsonb_build_array()
        )
        from public.invitation_drafts
        where invitation_drafts.invitation_id = 'e2000000-0000-4000-8000-000000000001'
      )
    )
  $publish$,
  'the v1 publication exists before the draft upgrades'
);

select is(
  public.upgrade_invitation_template(
    'e2000000-0000-4000-8000-000000000001',
    1,
    '40000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000005',
    (
      select jsonb_set(
        invitation_drafts.document,
        '{templateVersionId}',
        to_jsonb('40000000-0000-4000-8000-000000000005'::text),
        false
      )
      from public.invitation_drafts
      where invitation_drafts.invitation_id = 'e2000000-0000-4000-8000-000000000001'
    )
  ),
  2::bigint,
  'the declared v1 to v2 transition advances the revision once'
);

select is(
  (
    select invitations.template_version_id
    from public.invitations
    where invitations.id = 'e2000000-0000-4000-8000-000000000001'
  ),
  '40000000-0000-4000-8000-000000000005'::uuid,
  'the invitation current-version pin advances to v2'
);

select ok(
  exists (
    select 1
    from public.invitation_drafts
    where invitation_drafts.invitation_id = 'e2000000-0000-4000-8000-000000000001'
      and invitation_drafts.template_version_id = '40000000-0000-4000-8000-000000000005'
      and invitation_drafts.revision = 2
      and invitation_drafts.document ->> 'templateVersionId'
        = '40000000-0000-4000-8000-000000000005'
      and invitation_drafts.document #>> '{theme,creatorColor}' = '#123456'
      and invitation_drafts.document #>> '{opening,fallbackRecipientText}' = 'Our family guest'
  ),
  'the draft advances while all creator-owned fields remain unchanged'
);

select ok(
  exists (
    select 1
    from public.publication_versions
    where publication_versions.invitation_id = 'e2000000-0000-4000-8000-000000000001'
      and publication_versions.template_version_id
        = '40000000-0000-4000-8000-000000000004'
      and publication_versions.renderer_key = 'little-blessings-v1'
  ),
  'the immutable v1 publication remains pinned after the draft advances'
);

select lives_ok(
  $publish$
    select public.request_invitation_publication(
      'e2000000-0000-4000-8000-000000000001',
      2,
      'e5000000-0000-4000-8000-000000000002',
      (
        select jsonb_build_object(
          'snapshotVersion', 1,
          'invitationSchemaVersion', 1,
          'rendererKey', 'little-blessings-v2',
          'rendererVersion', 2,
          'templateVersionId', invitation_drafts.template_version_id,
          'templateVersion', 2,
          'draftRevision', invitation_drafts.revision,
          'document', invitation_drafts.document,
          'assets', jsonb_build_array()
        )
        from public.invitation_drafts
        where invitation_drafts.invitation_id = 'e2000000-0000-4000-8000-000000000001'
      )
    )
  $publish$,
  'the upgraded draft can create a separately pinned v2 publication'
);

select is(
  (
    select count(*)
    from public.publication_versions
    where publication_versions.invitation_id = 'e2000000-0000-4000-8000-000000000001'
      and (publication_versions.renderer_key, publication_versions.renderer_version) in (
        ('little-blessings-v1', 1),
        ('little-blessings-v2', 2)
      )
  ),
  2::bigint,
  'v1 history and the new v2 publication coexist under one invitation'
);

select throws_ok(
  $stale$
    select public.upgrade_invitation_template(
      'e2000000-0000-4000-8000-000000000001',
      1,
      '40000000-0000-4000-8000-000000000004',
      '40000000-0000-4000-8000-000000000005',
      '{}'::jsonb
    )
  $stale$,
  '40001',
  'Invitation draft revision conflict',
  'a stale editor cannot replay the transition'
);

select throws_ok(
  $unsupported$
    select public.upgrade_invitation_template(
      'e2000000-0000-4000-8000-000000000001',
      2,
      '40000000-0000-4000-8000-000000000005',
      '40000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )
  $unsupported$,
  '55000',
  'Template upgrade is unavailable',
  'an undeclared transition is rejected'
);

select lives_ok(
  $create$
    select public.create_invitation_draft(
      'e2000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000004',
      'Second Little Blessings invitation',
      'christening',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000004',
        'locale', 'en-PH',
        'eventTimezone', 'Asia/Manila',
        'sections', jsonb_build_array(),
        'assets', jsonb_build_array()
      )
    )
  $create$,
  'a second v1 draft exists for preservation rejection coverage'
);

select throws_ok(
  $content$
    select public.upgrade_invitation_template(
      'e2000000-0000-4000-8000-000000000002',
      1,
      '40000000-0000-4000-8000-000000000004',
      '40000000-0000-4000-8000-000000000005',
      (
        select jsonb_set(
          jsonb_set(
            invitation_drafts.document,
            '{templateVersionId}',
            to_jsonb('40000000-0000-4000-8000-000000000005'::text),
            false
          ),
          '{locale}',
          to_jsonb('fil-PH'::text),
          false
        )
        from public.invitation_drafts
        where invitation_drafts.invitation_id = 'e2000000-0000-4000-8000-000000000002'
      )
    )
  $content$,
  '23514',
  'Template upgrade changed creator content',
  'a migration payload cannot alter any creator-owned field'
);

select * from finish();
rollback;
