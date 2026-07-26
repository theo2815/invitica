begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

-- Note on ordering: 0006's wrapper returns or rejects any second snapshot for a
-- draft revision it has already published, so every rejection below runs
-- against a draft that has not been published yet. Otherwise the wrapper would
-- raise before the widened checks were ever reached, and these assertions would
-- pass for the wrong reason.
select plan(17);

select ok(
  not has_function_privilege('authenticated', 'public.publication_assets_are_valid(jsonb,jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.publication_assets_are_valid(jsonb,jsonb)', 'execute'),
  'the publication asset validator is not part of the client API'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.request_invitation_publication_v0005(uuid,bigint,uuid,jsonb)',
    'execute'
  ),
  'the widened inner publication function stays reachable only through its wrapper'
);

delete from auth.users where id = 'c1000000-0000-4000-8000-000000000001'::uuid;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'publication-widening@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'The publishing creator has a personal workspace'
);

-- A Little Blessings draft carrying one photograph, which is the case 0005
-- could not express at all.
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'c2000000-0000-4000-8000-000000000001',
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
            'id', 'c3000000-0000-4000-8000-000000000001',
            'type', 'hero', 'visible', true, 'animationPreset', 'fade-in',
            'props', jsonb_build_object(
              'title', 'Eliana Grace',
              'imageAssetId', 'c4000000-0000-4000-8000-000000000001'
            )
          )
        ),
        'assets', jsonb_build_array(
          jsonb_build_object('id', 'c4000000-0000-4000-8000-000000000001', 'kind', 'image')
        )
      )
    )
  $create$,
  'A Little Blessings draft with one photograph can be created'
);

-- A Garden Promise draft with no media, which must keep working exactly as
-- before this migration.
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'c2000000-0000-4000-8000-000000000002',
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
            'id', 'c3000000-0000-4000-8000-000000000002',
            'type', 'hero', 'visible', true, 'animationPreset', 'fade-in',
            'props', jsonb_build_object('title', 'Mara & Joaquin')
          )
        ),
        'assets', jsonb_build_array()
      )
    )
  $create$,
  'A Garden Promise draft with no media can be created'
);

-- A draft on a template version that is not allowlisted.
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'c2000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000002',
      'Unsupported template invitation',
      'debut',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000002',
        'eventTimezone', 'Asia/Manila',
        'sections', jsonb_build_array(
          jsonb_build_object(
            'id', 'c3000000-0000-4000-8000-000000000003',
            'type', 'hero', 'visible', true, 'animationPreset', 'fade-in',
            'props', jsonb_build_object('title', 'Unsupported')
          )
        ),
        'assets', jsonb_build_array()
      )
    )
  $create$,
  'A draft on an unfinished template can be created'
);

create or replace function pg_temp.snapshot(
  p_invitation_id uuid,
  p_renderer_key text,
  p_assets jsonb
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'snapshotVersion', 1,
    'invitationSchemaVersion', 1,
    'rendererKey', p_renderer_key,
    'rendererVersion', 1,
    'templateVersionId', invitation_drafts.template_version_id,
    'templateVersion', 1,
    'draftRevision', invitation_drafts.revision,
    'document', invitation_drafts.document,
    'assets', p_assets
  )
  from public.invitation_drafts
  where invitation_drafts.invitation_id = p_invitation_id;
$$;

create or replace function pg_temp.rendition(p_digest text, p_width integer)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'byteLength', 18000,
    'height', p_width,
    'objectKey', concat('publication-media/v1/', p_digest, '/w', p_width::text, '.webp'),
    'sha256', p_digest,
    'width', p_width
  );
$$;

create or replace function pg_temp.image_manifest(p_asset_id uuid, p_digest text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    jsonb_build_object(
      'contentType', 'image/webp',
      'height', 1500,
      'id', p_asset_id,
      'kind', 'image',
      'renditions', jsonb_build_array(
        pg_temp.rendition(p_digest, 320),
        pg_temp.rendition(p_digest, 640)
      ),
      'width', 1200
    )
  );
$$;

select ok(
  public.request_invitation_publication(
    'c2000000-0000-4000-8000-000000000002',
    1,
    'c5000000-0000-4000-8000-000000000001',
    pg_temp.snapshot(
      'c2000000-0000-4000-8000-000000000002', 'garden-promise-v1', '[]'::jsonb
    )
  ) is not null,
  'a Garden Promise publication with no media still succeeds'
);

select throws_ok(
  $reject$select public.request_invitation_publication(
    'c2000000-0000-4000-8000-000000000003',
    1,
    'c5000000-0000-4000-8000-000000000003',
    pg_temp.snapshot(
      'c2000000-0000-4000-8000-000000000003', 'standard-v1', '[]'::jsonb
    )
  )$reject$,
  '22023', null, 'a template version that is not allowlisted cannot publish'
);

select throws_ok(
  $reject$select public.request_invitation_publication(
    'c2000000-0000-4000-8000-000000000001',
    1,
    'c5000000-0000-4000-8000-000000000004',
    pg_temp.snapshot(
      'c2000000-0000-4000-8000-000000000001', 'garden-promise-v1',
      pg_temp.image_manifest('c4000000-0000-4000-8000-000000000001', repeat('ab', 32))
    )
  )$reject$,
  '22023', null, 'a renderer key that does not belong to the template cannot publish'
);

select throws_ok(
  $reject$select public.request_invitation_publication(
    'c2000000-0000-4000-8000-000000000001',
    1,
    'c5000000-0000-4000-8000-000000000005',
    pg_temp.snapshot('c2000000-0000-4000-8000-000000000001', 'little-blessings-v1', '[]'::jsonb)
  )$reject$,
  '22023', null, 'a photograph the document references cannot be missing from the manifest'
);

select throws_ok(
  $reject$select public.request_invitation_publication(
    'c2000000-0000-4000-8000-000000000001',
    1,
    'c5000000-0000-4000-8000-000000000006',
    pg_temp.snapshot(
      'c2000000-0000-4000-8000-000000000001', 'little-blessings-v1',
      pg_temp.image_manifest('c4000000-0000-4000-8000-000000000001', repeat('ab', 32))
        || pg_temp.image_manifest('c4000000-0000-4000-8000-000000000009', repeat('cd', 32))
    )
  )$reject$,
  '22023', null, 'the manifest cannot publish media the invitation does not reference'
);

-- The mutable draft key rather than the immutable content-addressed one: this is
-- the check that keeps a published snapshot from following later draft edits.
select throws_ok(
  $reject$select public.request_invitation_publication(
    'c2000000-0000-4000-8000-000000000001',
    1,
    'c5000000-0000-4000-8000-000000000007',
    pg_temp.snapshot(
      'c2000000-0000-4000-8000-000000000001', 'little-blessings-v1',
      jsonb_build_array(
        jsonb_build_object(
          'contentType', 'image/webp', 'height', 1500,
          'id', 'c4000000-0000-4000-8000-000000000001', 'kind', 'image',
          'renditions', jsonb_build_array(
            jsonb_build_object(
              'byteLength', 18000, 'height', 320,
              'objectKey', 'media/renditions/v1/c4000000-0000-4000-8000-000000000001/w320.webp',
              'sha256', repeat('ab', 32), 'width', 320
            )
          ),
          'width', 1200
        )
      )
    )
  )$reject$,
  '22023', null, 'a rendition key that is not derived from its own digest cannot publish'
);

select throws_ok(
  $reject$select public.request_invitation_publication(
    'c2000000-0000-4000-8000-000000000001',
    1,
    'c5000000-0000-4000-8000-000000000008',
    pg_temp.snapshot(
      'c2000000-0000-4000-8000-000000000001', 'little-blessings-v1',
      pg_temp.image_manifest('c4000000-0000-4000-8000-000000000001', 'not-a-sha-256')
    )
  )$reject$,
  '22023', null, 'a rendition without a real digest cannot publish'
);

-- The two assertions below call the validator directly, which the first
-- assertion in this file proves no client role may do. They therefore run as
-- postgres; the authenticated role is restored before the publication calls
-- that follow, which derive their owner from auth.uid().
set local role postgres;

select ok(
  not public.publication_assets_are_valid(
    jsonb_build_object(
      'assets', jsonb_build_array(
        jsonb_build_object('id', 'c4000000-0000-4000-8000-000000000002', 'kind', 'audio')
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'contentType', 'image/webp', 'height', 100,
        'id', 'c4000000-0000-4000-8000-000000000002', 'kind', 'image',
        'renditions', jsonb_build_array(pg_temp.rendition(repeat('ef', 32), 320)),
        'width', 100
      )
    )
  ),
  'audio cannot be published, because nothing can serve it yet'
);

select ok(
  public.publication_assets_are_valid(
    jsonb_build_object('assets', jsonb_build_array()),
    jsonb_build_array()
  ),
  'a document with no media needs no manifest'
);

set local role authenticated;

-- Last, because publishing this draft closes revision 1 to any other snapshot.
select ok(
  public.request_invitation_publication(
    'c2000000-0000-4000-8000-000000000001',
    1,
    'c5000000-0000-4000-8000-000000000002',
    pg_temp.snapshot(
      'c2000000-0000-4000-8000-000000000001',
      'little-blessings-v1',
      pg_temp.image_manifest(
        'c4000000-0000-4000-8000-000000000001',
        repeat('ab', 32)
      )
    )
  ) is not null,
  'a Little Blessings publication carrying a photograph succeeds'
);

select is(
  (select renderer_key from public.publication_versions
    where invitation_id = 'c2000000-0000-4000-8000-000000000001'),
  'little-blessings-v1',
  'the stored publication records the template renderer rather than a hardcoded one'
);

select * from finish();

rollback;
