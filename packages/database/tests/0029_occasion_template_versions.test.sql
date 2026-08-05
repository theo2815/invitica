begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(15);

select is(
  (select count(*) from public.template_version_policies),
  7::bigint,
  'seven immutable production template versions are admitted'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_array(
        template_version_id,
        template_id,
        template_version,
        renderer_key,
        renderer_version,
        editor_key
      )
      order by template_version_id
    )
    from public.template_version_policies
    where template_version_id in (
      '40000000-0000-4000-8000-000000000006',
      '40000000-0000-4000-8000-000000000007',
      '40000000-0000-4000-8000-000000000008'
    )
  ),
  '[
    ["40000000-0000-4000-8000-000000000006", "garden-promise", 2, "garden-promise-v2", 2, "section-document-v1"],
    ["40000000-0000-4000-8000-000000000007", "golden-hour", 2, "golden-hour-v2", 2, "section-document-v1"],
    ["40000000-0000-4000-8000-000000000008", "sunday-joy", 2, "sunday-joy-v2", 2, "section-document-v1"]
  ]'::jsonb,
  'database release tuples match the three new repository manifests'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_array(template_id, allowed_section_types)
      order by template_version_id
    )
    from public.template_version_policies
    where template_version_id in (
      '40000000-0000-4000-8000-000000000006',
      '40000000-0000-4000-8000-000000000007',
      '40000000-0000-4000-8000-000000000008'
    )
  ),
  '[
    ["garden-promise", ["hero", "message", "countdown", "event-details", "participants", "schedule", "attire", "gallery", "guidance", "gifts", "rsvp"]],
    ["golden-hour", ["hero", "message", "countdown", "event-details", "participants", "schedule", "attire", "gallery", "guidance", "rsvp"]],
    ["sunday-joy", ["hero", "message", "countdown", "event-details", "schedule", "attire", "gallery", "guidance", "gifts", "rsvp"]]
  ]'::jsonb,
  'database policies preserve the approved ordered section plans'
);
select ok(
  not exists (
    select 1
    from public.template_version_policies
    where template_version_id in (
      '40000000-0000-4000-8000-000000000006',
      '40000000-0000-4000-8000-000000000007',
      '40000000-0000-4000-8000-000000000008'
    )
      and required_visible_section_types <> array['hero', 'event-details']
  ),
  'hero and event details remain visible in every new version'
);
select has_function(
  'public',
  'invitation_validate_section_v0028',
  array['text', 'boolean', 'jsonb'],
  'the unchanged v0028 section validator remains available privately'
);
select has_function(
  'public',
  'invitation_validate_section',
  array['text', 'boolean', 'jsonb'],
  'the widened section validator keeps the stable internal name'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.invitation_validate_section(text,boolean,jsonb)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.invitation_validate_section_v0028(text,boolean,jsonb)',
      'execute'
    ),
  'both section validators remain private implementation details'
);

select lives_ok(
  $participants$
    select public.invitation_validate_section(
      'participants',
      true,
      jsonb_build_object(
        'heading', 'Wedding party',
        'groups', (
          select jsonb_agg(
            jsonb_build_object(
              'label', 'Group ' || series,
              'names', jsonb_build_array('Fictional participant ' || series)
            )
          )
          from generate_series(1, 10) as series
        )
      )
    )
  $participants$,
  'ten participant groups pass the database mutation boundary'
);
select throws_ok(
  $participants$
    select public.invitation_validate_section(
      'participants',
      true,
      jsonb_build_object(
        'groups', (
          select jsonb_agg(
            jsonb_build_object(
              'label', 'Group ' || series,
              'names', jsonb_build_array('Fictional participant ' || series)
            )
          )
          from generate_series(1, 11) as series
        )
      )
    )
  $participants$,
  '22023',
  null,
  'an eleventh participant group is rejected'
);
select lives_ok(
  $schedule$
    select public.invitation_validate_section(
      'schedule',
      true,
      jsonb_build_object(
        'heading', 'Program',
        'items', (
          select jsonb_agg(
            jsonb_build_object(
              'timeLabel', series || ':00 PM',
              'title', 'Program item ' || series
            )
          )
          from generate_series(1, 16) as series
        )
      )
    )
  $schedule$,
  'sixteen schedule entries pass the database mutation boundary'
);
select throws_ok(
  $schedule$
    select public.invitation_validate_section(
      'schedule',
      true,
      jsonb_build_object(
        'items', (
          select jsonb_agg(
            jsonb_build_object(
              'timeLabel', series || ':00 PM',
              'title', 'Program item ' || series
            )
          )
          from generate_series(1, 17) as series
        )
      )
    )
  $schedule$,
  '22023',
  null,
  'a seventeenth schedule entry is rejected'
);
select lives_ok(
  $$select public.invitation_validate_section(
    'hero',
    true,
    '{"title":"A valid celebrant"}'::jsonb
  )$$,
  'unchanged section types still use the reviewed v0028 validator'
);
select throws_ok(
  $$select public.invitation_validate_section(
    'hero',
    true,
    '{"title":"A valid celebrant","unexpected":true}'::jsonb
  )$$,
  '22023',
  null,
  'unchanged strict-key rejection remains active'
);
select is(
  (
    select cardinality(visibility_editable_section_types)
    from public.template_version_policies
    where template_version_id = '40000000-0000-4000-8000-000000000006'
  ),
  9,
  'Garden Promise exposes nine optional visibility switches'
);
select is(
  (
    select cardinality(visibility_editable_section_types)
    from public.template_version_policies
    where template_version_id = '40000000-0000-4000-8000-000000000008'
  ),
  8,
  'Sunday Joy omits participants and exposes eight optional visibility switches'
);

select * from finish();
rollback;
