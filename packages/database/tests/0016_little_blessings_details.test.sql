begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(25);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_little_blessings_details(uuid,bigint,jsonb)',
    'execute'
  ),
  'authenticated creators can execute the bounded Little Blessings update RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.update_little_blessings_details(uuid,bigint,jsonb)',
    'execute'
  ),
  'anonymous users cannot execute the bounded Little Blessings update RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.little_blessings_check_scalar(jsonb,text,boolean,text,integer,text)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated', 'public.little_blessings_check_keys(jsonb,text[],text)', 'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.little_blessings_check_array(jsonb,text,boolean,integer,integer,text)',
      'execute'
    ),
  'the internal validation helpers are not part of the client API'
);

delete from auth.users
where id in (
  'b1000000-0000-4000-8000-000000000001'::uuid,
  'b2000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'blessings-editor-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'blessings-editor-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User A can provision a personal workspace'
);

select lives_ok(
  $create$
    select public.create_invitation_draft(
      'b3000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000004',
      'Little Blessings invitation',
      'christening',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000004',
        'eventTimezone', 'Asia/Manila',
        'sections', jsonb_build_array(
          jsonb_build_object(
            'id', 'b4000000-0000-4000-8000-000000000001',
            'type', 'hero', 'visible', true, 'animationPreset', 'fade-in',
            'props', jsonb_build_object(
              'title', 'Original name',
              'imageAssetId', 'b5000000-0000-4000-8000-000000000001'
            )
          ),
          jsonb_build_object(
            'id', 'b4000000-0000-4000-8000-000000000002',
            'type', 'countdown', 'visible', true, 'animationPreset', 'fade-in',
            'props', jsonb_build_object(
              'target', '2027-04-11T09:00:00+08:00', 'dateLabel', 'Original countdown'
            )
          ),
          jsonb_build_object(
            'id', 'b4000000-0000-4000-8000-000000000003',
            'type', 'event-details', 'visible', true, 'animationPreset', 'fade-up',
            'props', jsonb_build_object(
              'events', jsonb_build_array(
                jsonb_build_object(
                  'label', 'Christening ceremony',
                  'startAt', '2027-04-11T09:00:00+08:00',
                  'dateLabel', '9:00 AM',
                  'venueName', 'New Hope Community Church',
                  'address', 'Quezon City, Metro Manila, Philippines'
                )
              )
            )
          ),
          jsonb_build_object(
            'id', 'b4000000-0000-4000-8000-000000000004',
            'type', 'guidance', 'visible', true, 'animationPreset', 'fade-up',
            'props', jsonb_build_object(
              'items', jsonb_build_array('A gentle note that must remain unchanged.')
            )
          ),
          jsonb_build_object(
            'id', 'b4000000-0000-4000-8000-000000000005',
            'type', 'gallery', 'visible', true, 'animationPreset', 'fade-up',
            'props', jsonb_build_object(
              'images', jsonb_build_array(
                jsonb_build_object('assetId', 'b5000000-0000-4000-8000-000000000002'),
                jsonb_build_object('assetId', 'b5000000-0000-4000-8000-000000000003'),
                jsonb_build_object('assetId', 'b5000000-0000-4000-8000-000000000004')
              )
            )
          ),
          jsonb_build_object(
            'id', 'b4000000-0000-4000-8000-000000000006',
            'type', 'gifts', 'visible', true, 'animationPreset', 'fade-up',
            'props', jsonb_build_object(
              'items', jsonb_build_array(jsonb_build_object('name', 'Board books'))
            )
          ),
          jsonb_build_object(
            'id', 'b4000000-0000-4000-8000-000000000007',
            'type', 'rsvp', 'visible', true, 'animationPreset', 'scale-in',
            'props', jsonb_build_object('message', 'Original reply message')
          )
        ),
        'assets', jsonb_build_array(
          jsonb_build_object('id', 'b5000000-0000-4000-8000-000000000001', 'kind', 'image'),
          jsonb_build_object('id', 'b5000000-0000-4000-8000-000000000002', 'kind', 'image'),
          jsonb_build_object('id', 'b5000000-0000-4000-8000-000000000003', 'kind', 'image'),
          jsonb_build_object('id', 'b5000000-0000-4000-8000-000000000004', 'kind', 'image')
        )
      )
    )
  $create$,
  'User A can create the Little Blessings draft used by this test'
);

select is(
  public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003',
    1,
    jsonb_build_object(
      'hero', jsonb_build_object(
        'visible', true,
        'props', jsonb_build_object(
          'title', 'Eliana Grace',
          'imageAssetId', 'b5000000-0000-4000-8000-000000000001'
        )
      ),
      'countdown', jsonb_build_object(
        'visible', false,
        'props', jsonb_build_object(
          'target', '2027-04-11T09:00:00+08:00', 'dateLabel', 'Sunday, April 11, 2027'
        )
      ),
      'gallery', jsonb_build_object(
        'visible', true,
        'props', jsonb_build_object(
          'images', jsonb_build_array(
            jsonb_build_object(
              'assetId', 'b5000000-0000-4000-8000-000000000003',
              'caption', 'A morning in the garden'
            ),
            jsonb_build_object('assetId', 'b5000000-0000-4000-8000-000000000002')
          )
        )
      )
    )
  ),
  2::bigint,
  'a matching revision saves the listed sections and returns revision two'
);
select is(
  (select document #>> '{sections,0,props,title}' from public.invitation_drafts
    where invitation_id = 'b3000000-0000-4000-8000-000000000003'),
  'Eliana Grace',
  'the celebrant name is replaced'
);
select is(
  (select document #>> '{sections,1,visible}' from public.invitation_drafts
    where invitation_id = 'b3000000-0000-4000-8000-000000000003'),
  'false',
  'an optional section can be hidden without losing its content'
);
select is(
  (select document #>> '{sections,1,props,dateLabel}' from public.invitation_drafts
    where invitation_id = 'b3000000-0000-4000-8000-000000000003'),
  'Sunday, April 11, 2027',
  'a hidden section keeps its saved content in the document'
);
select is(
  (select document #>> '{sections,3,props,items,0}' from public.invitation_drafts
    where invitation_id = 'b3000000-0000-4000-8000-000000000003'),
  'A gentle note that must remain unchanged.',
  'a section absent from the payload is left untouched'
);
select is(
  (select document #> '{assets}' from public.invitation_drafts
    where invitation_id = 'b3000000-0000-4000-8000-000000000003'),
  jsonb_build_array(
    jsonb_build_object('id', 'b5000000-0000-4000-8000-000000000001', 'kind', 'image'),
    jsonb_build_object('id', 'b5000000-0000-4000-8000-000000000003', 'kind', 'image'),
    jsonb_build_object('id', 'b5000000-0000-4000-8000-000000000002', 'kind', 'image')
  ),
  'the asset list is rebuilt from the images the document still references'
);

select throws_ok(
  $hide$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 2,
    jsonb_build_object(
      'hero', jsonb_build_object(
        'visible', false, 'props', jsonb_build_object('title', 'Eliana Grace')
      )
    )
  )$hide$,
  '23514', null, 'the hero section cannot be hidden'
);
select throws_ok(
  $hide$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 2,
    jsonb_build_object(
      'event-details', jsonb_build_object(
        'visible', false,
        'props', jsonb_build_object(
          'events', jsonb_build_array(
            jsonb_build_object(
              'label', 'Christening ceremony',
              'startAt', '2027-04-11T09:00:00+08:00',
              'dateLabel', '9:00 AM',
              'venueName', 'New Hope Community Church',
              'address', 'Quezon City, Metro Manila, Philippines'
            )
          )
        )
      )
    )
  )$hide$,
  '23514', null, 'the Where and when section cannot be hidden'
);
select is(
  public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 2,
    jsonb_build_object(
      'rsvp', jsonb_build_object(
        'visible', false, 'props', jsonb_build_object('heading', 'Celebrate with us')
      )
    )
  ),
  3::bigint,
  'the reply section may be hidden by the creator'
);

select throws_ok(
  $gifts$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 3,
    jsonb_build_object(
      'gifts', jsonb_build_object(
        'visible', true,
        'props', jsonb_build_object(
          'items', (
            select jsonb_agg(jsonb_build_object('name', 'Gift idea ' || counter))
            from generate_series(1, 9) as counter
          )
        )
      )
    )
  )$gifts$,
  '22023', null, 'a ninth gift idea is rejected'
);
select throws_ok(
  $photos$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 3,
    jsonb_build_object(
      'gallery', jsonb_build_object(
        'visible', true,
        'props', jsonb_build_object(
          'images', (
            select jsonb_agg(
              jsonb_build_object(
                'assetId', ('b5000000-0000-4000-8000-00000000000' || counter)::uuid
              )
            )
            from generate_series(1, 9) as counter
          )
        )
      )
    )
  )$photos$,
  '22023', null, 'a ninth photograph is rejected'
);
select throws_ok(
  $blank$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 3,
    jsonb_build_object(
      'hero', jsonb_build_object('visible', true, 'props', jsonb_build_object('title', '   '))
    )
  )$blank$,
  '22023', null, 'an untrimmed or blank celebrant name is rejected'
);
select throws_ok(
  $unknown$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 3,
    jsonb_build_object(
      'hero', jsonb_build_object(
        'visible', true,
        'props', jsonb_build_object('title', 'Eliana Grace', 'script', '<script>')
      )
    )
  )$unknown$,
  '22023', null, 'an unmodelled section field is rejected'
);
select throws_ok(
  $venue$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 3,
    jsonb_build_object(
      'venue', jsonb_build_object(
        'visible', true, 'props', jsonb_build_object('venueName', 'Somewhere')
      )
    )
  )$venue$,
  '22023', null, 'a section type outside the Little Blessings contract is rejected'
);
select throws_ok(
  $missing$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 3,
    jsonb_build_object(
      'message', jsonb_build_object(
        'visible', true, 'props', jsonb_build_object('body', 'Held in grace.')
      )
    )
  )$missing$,
  '23514', null, 'a section this invitation does not contain cannot be added'
);
select throws_ok(
  $stale$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 1,
    jsonb_build_object(
      'hero', jsonb_build_object('visible', true, 'props', jsonb_build_object('title', 'Stale'))
    )
  )$stale$,
  '40001', null, 'a stale revision cannot overwrite the saved draft'
);
select is(
  (select revision from public.invitation_drafts
    where invitation_id = 'b3000000-0000-4000-8000-000000000003'),
  3::bigint,
  'a rejected save does not increment the revision'
);

select lives_ok(
  $garden$
    select public.create_invitation_draft(
      'b6000000-0000-4000-8000-000000000006',
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
            'id', 'b7000000-0000-4000-8000-000000000007',
            'type', 'hero', 'visible', true, 'animationPreset', 'fade-in',
            'props', jsonb_build_object('title', 'Mara & Joaquin')
          )
        ),
        'assets', jsonb_build_array()
      )
    )
  $garden$,
  'User A can create a second draft on a different template'
);
select throws_ok(
  $template$select public.update_little_blessings_details(
    'b6000000-0000-4000-8000-000000000006', 1,
    jsonb_build_object(
      'hero', jsonb_build_object(
        'visible', true, 'props', jsonb_build_object('title', 'Wrong template')
      )
    )
  )$template$,
  '23514', null, 'another template cannot be edited through the Little Blessings RPC'
);
select throws_ok(
  $$update public.invitation_drafts set revision = 9
    where invitation_id = 'b3000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'an authenticated creator cannot bypass the save RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User B can provision a separate personal workspace'
);
select throws_ok(
  $cross$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 3,
    jsonb_build_object(
      'hero', jsonb_build_object(
        'visible', true, 'props', jsonb_build_object('title', 'Cross-workspace')
      )
    )
  )$cross$,
  'P0002', null, 'another workspace cannot update User A draft'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $anon$select public.update_little_blessings_details(
    'b3000000-0000-4000-8000-000000000003', 3,
    jsonb_build_object(
      'hero', jsonb_build_object('visible', true, 'props', jsonb_build_object('title', 'Anonymous'))
    )
  )$anon$,
  '42501', null, 'anonymous Little Blessings updates are denied'
);

set local role postgres;
select * from finish();
rollback;
