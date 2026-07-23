begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(23);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_garden_promise_details(uuid,bigint,text,text,text,text,text,text,text,date)',
    'execute'
  ),
  'authenticated creators can execute the constrained Garden Promise update RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.update_garden_promise_details(uuid,bigint,text,text,text,text,text,text,text,date)',
    'execute'
  ),
  'anonymous users cannot execute the constrained Garden Promise update RPC'
);
select ok(
  not has_column_privilege('authenticated', 'public.invitation_drafts', 'document', 'update')
    and not has_column_privilege('authenticated', 'public.invitation_drafts', 'revision', 'update'),
  'authenticated users still cannot update draft documents or revisions directly'
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
    'details-editor-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'details-editor-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
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
      'a3000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000001',
      'Garden Promise invitation',
      'wedding',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000001',
        'eventTimezone', 'Asia/Manila',
        'sections', jsonb_build_array(
          jsonb_build_object(
            'id', 'a4000000-0000-4000-8000-000000000004',
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
            'id', 'a5000000-0000-4000-8000-000000000005',
            'type', 'message',
            'visible', true,
            'animationPreset', 'fade-up',
            'props', jsonb_build_object('body', 'A message that must remain unchanged.')
          ),
          jsonb_build_object(
            'id', 'a6000000-0000-4000-8000-000000000006',
            'type', 'venue',
            'visible', true,
            'animationPreset', 'fade-up',
            'props', jsonb_build_object(
              'venueName', 'Original venue',
              'address', 'Original address',
              'mapUrl', 'https://maps.example.invalid/original'
            )
          ),
          jsonb_build_object(
            'id', 'a7000000-0000-4000-8000-000000000007',
            'type', 'rsvp',
            'visible', true,
            'animationPreset', 'scale-in',
            'props', jsonb_build_object(
              'message', 'Original reply message',
              'deadline', '2026-12-17T23:59:59+08:00'
            )
          )
        )
      )
    )
  $create$,
  'User A can create the draft used by the Garden Promise details test'
);

select is(
  public.update_garden_promise_details(
    'a3000000-0000-4000-8000-000000000003',
    1,
    '  Lira & Mateo  ',
    '   ',
    null,
    '  Sampaguita Courtyard  ',
    '  18 Acacia Road, Tagaytay  ',
    '   ',
    '  Please reply when you can.  ',
    '2027-01-02'::date
  ),
  2::bigint,
  'a matching revision saves all event-critical fields and returns revision two'
);
select is(
  (select document #>> '{sections,0,props,title}' from public.invitation_drafts
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  'Lira & Mateo',
  'the saved hero title is trimmed'
);
select ok(
  (select not (document #> '{sections,0,props}' ? 'subtitle') from public.invitation_drafts
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  'a blank optional subtitle is removed'
);
select ok(
  (select not (document #> '{sections,0,props}' ? 'dateLabel') from public.invitation_drafts
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  'an omitted optional display date is removed'
);
select is(
  (select document #>> '{sections,2,props,venueName}' from public.invitation_drafts
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  'Sampaguita Courtyard',
  'the venue name is trimmed and saved'
);
select is(
  (select document #>> '{sections,2,props,address}' from public.invitation_drafts
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  '18 Acacia Road, Tagaytay',
  'the venue address is trimmed and saved'
);
select ok(
  (select not (document #> '{sections,2,props}' ? 'mapUrl') from public.invitation_drafts
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  'a blank optional map URL is removed'
);
select is(
  (select document #>> '{sections,3,props,message}' from public.invitation_drafts
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  'Please reply when you can.',
  'the RSVP message is trimmed and saved'
);
select is(
  (select document #>> '{sections,3,props,deadline}' from public.invitation_drafts
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  '2027-01-02T23:59:59+08:00',
  'the RSVP date is stored at end-of-day Philippine time'
);
select is(
  (select document #>> '{sections,1,props,body}' from public.invitation_drafts
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  'A message that must remain unchanged.',
  'saving details leaves unrelated sections unchanged'
);

select throws_ok(
  $$select public.update_garden_promise_details(
    'a3000000-0000-4000-8000-000000000003', 1, 'Stale', null, null,
    'Venue', 'Address', null, null, null
  )$$,
  '40001', null, 'a stale revision cannot overwrite the saved draft'
);
select is(
  (select revision from public.invitation_drafts
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  2::bigint,
  'a rejected stale save does not increment the revision'
);
select throws_ok(
  $$select public.update_garden_promise_details(
    'a3000000-0000-4000-8000-000000000003', 2, 'Title', null, null,
    'Venue', 'Address', 'javascript:alert(1)', null, null
  )$$,
  '22023', null, 'a non-HTTP map URL is rejected'
);
select throws_ok(
  $$select public.update_garden_promise_details(
    'a3000000-0000-4000-8000-000000000003', 2, 'Title', null, null,
    '   ', 'Address', null, null, null
  )$$,
  '22023', null, 'a blank required venue name is rejected'
);
select throws_ok(
  $$update public.invitation_drafts set revision = 3
    where invitation_id = 'a3000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'an authenticated creator cannot bypass the save RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User B can provision a separate personal workspace'
);
select throws_ok(
  $$select public.update_garden_promise_details(
    'a3000000-0000-4000-8000-000000000003', 2, 'Cross-workspace', null, null,
    'Venue', 'Address', null, null, null
  )$$,
  'P0002', null, 'another workspace cannot update User A draft'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.update_garden_promise_details(
    'a3000000-0000-4000-8000-000000000003', 2, 'Anonymous', null, null,
    'Venue', 'Address', null, null, null
  )$$,
  '42501', null, 'anonymous Garden Promise updates are denied'
);

set local role postgres;
select * from finish();
rollback;
