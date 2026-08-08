begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(36);

select has_table(
  'public',
  'template_version_policies',
  'the database owns an explicit immutable-template release policy'
);
select columns_are(
  'public',
  'template_version_policies',
  array[
    'template_version_id',
    'template_id',
    'template_version',
    'invitation_schema_version',
    'renderer_key',
    'renderer_version',
    'editor_key',
    'allowed_section_types',
    'editable_section_types',
    'visibility_editable_section_types',
    'required_visible_section_types'
  ],
  'template policy stores only release, renderer, editor, and section authorization'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.template_version_policies'::regclass),
  'RLS is enabled on the template policy table'
);
select ok(
  not has_table_privilege('authenticated', 'public.template_version_policies', 'select')
    and not has_table_privilege('authenticated', 'public.template_version_policies', 'insert')
    and not has_table_privilege('anon', 'public.template_version_policies', 'select')
    and not has_table_privilege('service_role', 'public.template_version_policies', 'select'),
  'browser and service roles cannot read or mutate database release policy'
);
select is(
  (select count(*) from public.template_version_policies),
  7::bigint,
  'only the seven immutable production template versions are admitted'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_array(
        template_version_id,
        template_version,
        renderer_key,
        renderer_version,
        editor_key
      )
      order by template_version_id
    )
    from public.template_version_policies
  ),
  '[
    ["40000000-0000-4000-8000-000000000001", 1, "garden-promise-v1", 1, "focused-event-v1"],
    ["40000000-0000-4000-8000-000000000004", 1, "little-blessings-v1", 1, "section-document-v1"],
    ["40000000-0000-4000-8000-000000000005", 2, "little-blessings-v2", 2, "section-document-v1"],
    ["40000000-0000-4000-8000-000000000006", 2, "garden-promise-v2", 2, "section-document-v1"],
    ["40000000-0000-4000-8000-000000000007", 2, "golden-hour-v2", 2, "section-document-v1"],
    ["40000000-0000-4000-8000-000000000008", 2, "sunday-joy-v2", 2, "section-document-v1"],
    ["40000000-0000-4000-8000-000000000009", 1, "little-question-v1", 1, "section-document-v1"]
  ]'::jsonb,
  'database release tuples match repository registrations exactly'
);
select ok(
  (
    select editable_section_types = array['hero', 'venue', 'rsvp']
      and visibility_editable_section_types = '{}'::text[]
    from public.template_version_policies
    where template_version_id = '40000000-0000-4000-8000-000000000001'
  )
  and (
    select 'gallery' = any (visibility_editable_section_types)
      and required_visible_section_types = array['hero', 'event-details']
    from public.template_version_policies
    where template_version_id = '40000000-0000-4000-8000-000000000005'
  ),
  'policy preserves Garden scope and Little Blessings visibility rules'
);
select has_function(
  'public',
  'update_invitation_sections',
  array['uuid', 'bigint', 'jsonb'],
  'one generic stable-section update RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.update_invitation_sections(uuid,bigint,jsonb)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.update_invitation_sections(uuid,bigint,jsonb)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.update_invitation_sections(uuid,bigint,jsonb)',
      'execute'
    ),
  'only authenticated creators may execute the generic save RPC'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.update_invitation_sections(uuid,bigint,jsonb)'::regprocedure
  ),
  'the generic save RPC is a security-definer ownership boundary'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.update_invitation_sections(uuid,bigint,jsonb)'::regprocedure
  ),
  array['search_path=""']::text[],
  'the generic save RPC pins an empty search path'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.invitation_validate_section(text,boolean,jsonb)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.invitation_check_scalar(jsonb,text,boolean,text,integer,text)',
      'execute'
    ),
  'schema helpers remain private implementation details'
);

create function pg_temp.focused_document(
  p_template_version_id uuid,
  p_hero_id uuid,
  p_message_id uuid,
  p_venue_id uuid,
  p_rsvp_id uuid,
  p_title text
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'templateVersionId', p_template_version_id,
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
        'id', p_hero_id,
        'type', 'hero',
        'visible', true,
        'animationPreset', 'fade-in',
        'props', jsonb_build_object('title', p_title, 'dateLabel', 'January 17, 2027')
      ),
      jsonb_build_object(
        'id', p_message_id,
        'type', 'message',
        'visible', true,
        'animationPreset', 'fade-up',
        'props', jsonb_build_object('body', 'This message must remain unchanged.')
      ),
      jsonb_build_object(
        'id', p_venue_id,
        'type', 'venue',
        'visible', true,
        'animationPreset', 'fade-up',
        'props', jsonb_build_object(
          'venueName', 'Hiraya Garden Pavilion',
          'address', 'Silang, Cavite, Philippines'
        )
      ),
      jsonb_build_object(
        'id', p_rsvp_id,
        'type', 'rsvp',
        'visible', true,
        'animationPreset', 'scale-in',
        'props', jsonb_build_object('heading', 'Celebrate with us')
      )
    ),
    'assets', jsonb_build_array()
  )
$$;

create function pg_temp.snapshot(
  p_invitation_id uuid,
  p_renderer_key text,
  p_renderer_version integer,
  p_template_version integer
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'snapshotVersion', 1,
    'invitationSchemaVersion', 1,
    'rendererKey', p_renderer_key,
    'rendererVersion', p_renderer_version,
    'templateVersionId', invitation_drafts.template_version_id,
    'templateVersion', p_template_version,
    'draftRevision', invitation_drafts.revision,
    'document', invitation_drafts.document,
    'assets', jsonb_build_array()
  )
  from public.invitation_drafts
  where invitation_drafts.invitation_id = p_invitation_id
$$;

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
    'e1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'template-policy-owner@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'template-policy-other@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'the template-policy owner has a personal workspace'
);
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'e3000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Garden Promise invitation',
      'wedding',
      'Asia/Manila',
      'en-PH',
      pg_temp.focused_document(
        '40000000-0000-4000-8000-000000000001',
        'e4000000-0000-4000-8000-000000000001',
        'e4000000-0000-4000-8000-000000000002',
        'e4000000-0000-4000-8000-000000000003',
        'e4000000-0000-4000-8000-000000000004',
        'Mara & Joaquin'
      )
    )
  $create$,
  'a Garden Promise draft is ready for generic editing'
);
select is(
  public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000001',
    1,
    jsonb_build_array(
      jsonb_build_object(
        'id', 'e4000000-0000-4000-8000-000000000001',
        'visible', true,
        'props', jsonb_build_object(
          'title', 'Lira & Mateo',
          'dateLabel', 'February 14, 2027'
        )
      )
    )
  ),
  2::bigint,
  'a stable-ID Garden section patch increments the draft revision'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_array(value ->> 'id', value ->> 'type', value ->> 'animationPreset')
      order by ordinality
    )
    from public.invitation_drafts,
      jsonb_array_elements(document -> 'sections') with ordinality
    where invitation_id = 'e3000000-0000-4000-8000-000000000001'
  ),
  '[
    ["e4000000-0000-4000-8000-000000000001", "hero", "fade-in"],
    ["e4000000-0000-4000-8000-000000000002", "message", "fade-up"],
    ["e4000000-0000-4000-8000-000000000003", "venue", "fade-up"],
    ["e4000000-0000-4000-8000-000000000004", "rsvp", "scale-in"]
  ]'::jsonb,
  'section IDs, types, order, and animation presets remain immutable'
);
select is(
  (
    select jsonb_build_array(
      document #>> '{sections,0,props,title}',
      document #>> '{sections,1,props,body}'
    )
    from public.invitation_drafts
    where invitation_id = 'e3000000-0000-4000-8000-000000000001'
  ),
  '["Lira & Mateo", "This message must remain unchanged."]'::jsonb,
  'the requested props change while an unpatched section remains exact'
);
select throws_ok(
  $$select public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000001',
    1,
    '[{"id":"e4000000-0000-4000-8000-000000000001","visible":true,"props":{"title":"Stale"}}]'
  )$$,
  '40001',
  null,
  'a stale section patch cannot overwrite a newer revision'
);
select throws_ok(
  $$select public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000001',
    2,
    '[
      {"id":"e4000000-0000-4000-8000-000000000001","visible":true,"props":{"title":"First"}},
      {"id":"e4000000-0000-4000-8000-000000000001","visible":true,"props":{"title":"Second"}}
    ]'
  )$$,
  '22023',
  null,
  'one section ID cannot appear twice in a patch'
);
select throws_ok(
  $$select public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000001',
    2,
    '[{"id":"e4999999-0000-4000-8000-000000000999","visible":true,"props":{"title":"Unknown"}}]'
  )$$,
  '23514',
  null,
  'an unknown section ID cannot add or replace content'
);
select throws_ok(
  $$select public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000001',
    2,
    '[{
      "id":"e4000000-0000-4000-8000-000000000002",
      "visible":true,
      "props":{"body":"Garden scope must stay narrow."}
    }]'
  )$$,
  '23514',
  null,
  'Garden Promise message editing remains outside its current editor contract'
);
select throws_ok(
  $$select public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000001',
    2,
    '[{
      "id":"e4000000-0000-4000-8000-000000000003",
      "visible":false,
      "props":{"venueName":"Hiraya Garden Pavilion","address":"Silang, Cavite, Philippines"}
    }]'
  )$$,
  '23514',
  null,
  'Garden Promise cannot gain section visibility controls through the generic RPC'
);
select throws_ok(
  $$select public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000001',
    2,
    '[{
      "id":"e4000000-0000-4000-8000-000000000001",
      "visible":true,
      "props":{"title":"Valid title","rawHtml":"<script>unsafe</script>"}
    }]'
  )$$,
  '22023',
  null,
  'unknown section properties are rejected at the database boundary'
);

select lives_ok(
  $create$
    select public.create_invitation_draft(
      'e3000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000002',
      'Golden Hour invitation',
      'debut',
      'Asia/Manila',
      'en-PH',
      pg_temp.focused_document(
        '40000000-0000-4000-8000-000000000002',
        'e5000000-0000-4000-8000-000000000001',
        'e5000000-0000-4000-8000-000000000002',
        'e5000000-0000-4000-8000-000000000003',
        'e5000000-0000-4000-8000-000000000004',
        'Sam turns XVIII'
      )
    )
  $create$,
  'a fixture draft can exist without becoming editable or publishable'
);
select throws_ok(
  $$select public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000002',
    1,
    '[{"id":"e5000000-0000-4000-8000-000000000001","visible":true,"props":{"title":"Sam"}}]'
  )$$,
  '23514',
  null,
  'an unregistered template version cannot use the generic editor'
);
select throws_ok(
  $$insert into public.template_version_policies (
    template_version_id, template_id, template_version, invitation_schema_version,
    renderer_key, renderer_version, editor_key, allowed_section_types, editable_section_types
  ) values (
    '40000000-0000-4000-8000-000000000003', 'blocked', 1, 1,
    'standard-v1', 1, 'focused-event-v1', array['hero'], array['hero']
  )$$,
  '42501',
  null,
  'an authenticated caller cannot add a template policy'
);

set local role postgres;
select lives_ok(
  $$insert into public.template_version_policies (
    template_version_id,
    template_id,
    template_version,
    invitation_schema_version,
    renderer_key,
    renderer_version,
    editor_key,
    allowed_section_types,
    editable_section_types,
    visibility_editable_section_types,
    required_visible_section_types
  ) values (
    '40000000-0000-4000-8000-000000000002',
    'golden-hour',
    1,
    1,
    'standard-v1',
    1,
    'focused-event-v1',
    array['hero', 'message', 'venue', 'rsvp'],
    array['hero', 'venue', 'rsvp'],
    '{}',
    array['hero', 'venue']
  )$$,
  'a reviewed policy row is the only database registration a compatible template needs'
);

set local role authenticated;
select is(
  public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000002',
    1,
    '[{
      "id":"e5000000-0000-4000-8000-000000000001",
      "visible":true,
      "props":{"title":"Sam enters in gold"}
    }]'
  ),
  2::bigint,
  'a newly registered compatible template reuses the generic save function unchanged'
);
select throws_ok(
  $$select public.request_invitation_publication(
    'e3000000-0000-4000-8000-000000000002',
    2,
    'e6000000-0000-4000-8000-000000000001',
    pg_temp.snapshot(
      'e3000000-0000-4000-8000-000000000002',
      'garden-promise-v1',
      1,
      1
    )
  )$$,
  '22023',
  null,
  'publication still rejects a renderer tuple that does not match policy'
);
select ok(
  public.request_invitation_publication(
    'e3000000-0000-4000-8000-000000000002',
    2,
    'e6000000-0000-4000-8000-000000000002',
    pg_temp.snapshot(
      'e3000000-0000-4000-8000-000000000002',
      'standard-v1',
      1,
      1
    )
  ) is not null,
  'the same new policy row enables the exact compatible publication tuple'
);

select lives_ok(
  $create$
    select public.create_invitation_draft(
      'e3000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000005',
      'Little Blessings invitation',
      'christening',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000005',
        'locale', 'en-PH',
        'eventTimezone', 'Asia/Manila',
        'theme', jsonb_build_object(
          'colors', jsonb_build_object(
            'background', '#f9e5eb',
            'surface', '#fffbfc',
            'text', '#463640',
            'accent', '#dd7f9b',
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
            'id', 'e7000000-0000-4000-8000-000000000001',
            'type', 'hero',
            'visible', true,
            'animationPreset', 'fade-in',
            'props', jsonb_build_object('title', 'Eliana Grace')
          ),
          jsonb_build_object(
            'id', 'e7000000-0000-4000-8000-000000000002',
            'type', 'event-details',
            'visible', true,
            'animationPreset', 'fade-up',
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
            'id', 'e7000000-0000-4000-8000-000000000003',
            'type', 'gallery',
            'visible', false,
            'animationPreset', 'fade-up',
            'props', jsonb_build_object('heading', 'Little moments', 'images', jsonb_build_array())
          )
        ),
        'assets', jsonb_build_array()
      )
    )
  $create$,
  'a Little Blessings draft is ready for the same generic RPC'
);
select is(
  public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000003',
    1,
    '[{
      "id":"e7000000-0000-4000-8000-000000000003",
      "visible":false,
      "props":{"heading":"Our little moments","images":[]}
    }]'
  ),
  2::bigint,
  'a hidden empty gallery remains valid through the shared section validator'
);
select is(
  (
    select jsonb_build_array(
      document #>> '{sections,2,props,heading}',
      jsonb_array_length(document -> 'assets')
    )
    from public.invitation_drafts
    where invitation_id = 'e3000000-0000-4000-8000-000000000003'
  ),
  '["Our little moments", 0]'::jsonb,
  'the shared save keeps the gallery content and asset declaration consistent'
);
select throws_ok(
  $$select public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000003',
    2,
    '[{
      "id":"e7000000-0000-4000-8000-000000000001",
      "visible":false,
      "props":{"title":"Eliana Grace"}
    }]'
  )$$,
  '23514',
  null,
  'a required Little Blessings section cannot be hidden'
);

select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'the second creator has an isolated personal workspace'
);
select throws_ok(
  $$select public.update_invitation_sections(
    'e3000000-0000-4000-8000-000000000001',
    2,
    '[{
      "id":"e4000000-0000-4000-8000-000000000001",
      "visible":true,
      "props":{"title":"Cross-owner overwrite"}
    }]'
  )$$,
  'P0002',
  null,
  'a creator cannot discover or edit another workspace draft'
);

select * from finish();

rollback;
