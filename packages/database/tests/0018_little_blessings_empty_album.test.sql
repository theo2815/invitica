begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(9);

select ok(
  has_function_privilege(
    'authenticated', 'public.update_little_blessings_details(uuid,bigint,jsonb)', 'execute'
  )
    and not has_function_privilege(
      'anon', 'public.update_little_blessings_details(uuid,bigint,jsonb)', 'execute'
    ),
  'replacing the function keeps 0016 grants: creators may execute it, anonymous users may not'
);

delete from auth.users where id = 'd1000000-0000-4000-8000-000000000001'::uuid;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'empty-album@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'The album-editing creator has a personal workspace'
);

select lives_ok(
  $create$
    select public.create_invitation_draft(
      'd2000000-0000-4000-8000-000000000001',
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
            'id', 'd3000000-0000-4000-8000-000000000001',
            'type', 'hero', 'visible', true, 'animationPreset', 'fade-in',
            'props', jsonb_build_object('title', 'Eliana Grace')
          ),
          jsonb_build_object(
            'id', 'd3000000-0000-4000-8000-000000000002',
            'type', 'gallery', 'visible', true, 'animationPreset', 'fade-up',
            'props', jsonb_build_object(
              'heading', 'Little moments',
              'images', jsonb_build_array(
                jsonb_build_object('assetId', 'd4000000-0000-4000-8000-000000000001')
              )
            )
          )
        ),
        'assets', jsonb_build_array(
          jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000001', 'kind', 'image')
        )
      )
    )
  $create$,
  'A Little Blessings draft with one photograph can be created'
);

-- The state a new invitation starts in, and the one 0016 could not save.
select is(
  public.update_little_blessings_details(
    'd2000000-0000-4000-8000-000000000001',
    1,
    jsonb_build_object(
      'gallery', jsonb_build_object(
        'visible', false,
        'props', jsonb_build_object(
          'heading', 'Our own little moments',
          'images', jsonb_build_array()
        )
      )
    )
  ),
  2::bigint,
  'a hidden album may hold no photographs'
);
select is(
  (select document #>> '{sections,1,props,heading}' from public.invitation_drafts
    where invitation_id = 'd2000000-0000-4000-8000-000000000001'),
  'Our own little moments',
  'an empty album can still be named, so a new draft can autosave every section'
);
select is(
  (select document #> '{assets}' from public.invitation_drafts
    where invitation_id = 'd2000000-0000-4000-8000-000000000001'),
  '[]'::jsonb,
  'emptying the album releases the photographs it referenced'
);

select throws_ok(
  $reject$select public.update_little_blessings_details(
    'd2000000-0000-4000-8000-000000000001', 2,
    jsonb_build_object(
      'gallery', jsonb_build_object(
        'visible', true, 'props', jsonb_build_object('images', jsonb_build_array())
      )
    )
  )$reject$,
  '22023', null, 'an album with nothing in it cannot be shown to guests'
);

select is(
  public.update_little_blessings_details(
    'd2000000-0000-4000-8000-000000000001',
    2,
    jsonb_build_object(
      'gallery', jsonb_build_object(
        'visible', true,
        'props', jsonb_build_object(
          'images', jsonb_build_array(
            jsonb_build_object('assetId', 'd4000000-0000-4000-8000-000000000002')
          )
        )
      )
    )
  ),
  3::bigint,
  'adding the first photograph lets the album be shown again'
);

-- The rest of 0016's rules have to survive being restated.
select throws_ok(
  $reject$select public.update_little_blessings_details(
    'd2000000-0000-4000-8000-000000000001', 3,
    jsonb_build_object(
      'gallery', jsonb_build_object(
        'visible', true,
        'props', jsonb_build_object(
          'images', (
            select jsonb_agg(
              jsonb_build_object(
                'assetId', ('d4000000-0000-4000-8000-' || lpad(index::text, 12, '0'))
              )
            )
            from generate_series(1, 9) as index
          )
        )
      )
    )
  )$reject$,
  '22023', null, 'a ninth photograph is still refused'
);
select throws_ok(
  $reject$select public.update_little_blessings_details(
    'd2000000-0000-4000-8000-000000000001', 3,
    jsonb_build_object(
      'hero', jsonb_build_object(
        'visible', false, 'props', jsonb_build_object('title', 'Eliana Grace')
      )
    )
  )$reject$,
  '23514', null, 'the hero still cannot be hidden'
);

select * from finish();

rollback;
