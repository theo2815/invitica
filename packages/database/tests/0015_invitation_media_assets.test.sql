begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(24);

-- Privilege surface -----------------------------------------------------------
select ok(
  has_function_privilege(
    'authenticated',
    'public.record_invitation_image(uuid, uuid, text, text, bigint, text, text, integer, integer, jsonb)',
    'execute'
  ),
  'authenticated creators can record an invitation image'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.record_invitation_image(uuid, uuid, text, text, bigint, text, text, integer, integer, jsonb)',
    'execute'
  ),
  'anonymous users cannot record an invitation image'
);
select ok(
  has_function_privilege('authenticated', 'public.soft_delete_invitation_image(uuid)', 'execute'),
  'authenticated creators can soft delete an invitation image'
);
select ok(
  not has_function_privilege('anon', 'public.soft_delete_invitation_image(uuid)', 'execute'),
  'anonymous users cannot soft delete an invitation image'
);
select ok(
  has_table_privilege('authenticated', 'public.invitation_media_assets', 'select'),
  'authenticated creators can read media rows through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.invitation_media_assets', 'insert'),
  'authenticated creators cannot insert media rows directly'
);

-- Fixtures --------------------------------------------------------------------
delete from auth.users
where id in (
  'a5000000-0000-4000-8000-000000000001'::uuid,
  'a6000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'a5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'media-owner-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a6000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'media-owner-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User A can provision a personal workspace'
);
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'a5100000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Christening media invitation',
      'christening',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000001'
      )
    )
  $create$,
  'User A can create an unpublished invitation'
);

-- Direct writes are denied; only the RPC may insert -----------------------------
select throws_ok(
  $$
    insert into public.invitation_media_assets (
      id, workspace_id, invitation_id, role, original_content_type,
      original_byte_length, original_sha256, original_object_key, width, height, renditions
    )
    values (
      'a5200000-0000-4000-8000-000000000009',
      '00000000-0000-4000-8000-000000000000',
      'a5100000-0000-4000-8000-000000000001',
      'hero', 'image/jpeg', 1000, repeat('a', 64), 'k', 300, 300,
      jsonb_build_array(jsonb_build_object('width', 320, 'height', 240, 'byteLength', 1, 'sha256', repeat('b', 64)))
    )
  $$,
  '42501', null, 'authenticated creators cannot bypass the media RPC'
);

-- Owner records a valid image --------------------------------------------------
select lives_ok(
  $$
    select public.record_invitation_image(
      'a5100000-0000-4000-8000-000000000001',
      'a5200000-0000-4000-8000-000000000001',
      'hero', 'image/jpeg', 820000, repeat('a', 64),
      'media/originals/v1/a5200000-0000-4000-8000-000000000001.jpg',
      1600, 1200,
      jsonb_build_array(jsonb_build_object('width', 320, 'height', 240, 'byteLength', 12000, 'sha256', repeat('b', 64)))
    )
  $$,
  'User A can record a valid hero image'
);
select is(
  (
    select status || ':' || (deleted_at is null)::text
    from public.invitation_media_assets
    where id = 'a5200000-0000-4000-8000-000000000001'
  ),
  'ready:true',
  'a recorded image is ready and not deleted'
);

-- Cross-workspace isolation ----------------------------------------------------
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User B can provision a separate personal workspace'
);
select throws_ok(
  $$
    select public.record_invitation_image(
      'a5100000-0000-4000-8000-000000000001',
      'a5200000-0000-4000-8000-000000000003',
      'hero', 'image/jpeg', 820000, repeat('a', 64),
      'media/originals/v1/a5200000-0000-4000-8000-000000000003.jpg',
      1600, 1200,
      jsonb_build_array(jsonb_build_object('width', 320, 'height', 240, 'byteLength', 12000, 'sha256', repeat('b', 64)))
    )
  $$,
  'P0002', null, 'another workspace cannot record media on User A invitation'
);
select is(
  (select count(*) from public.invitation_media_assets),
  0::bigint,
  'User B cannot read User A media through RLS'
);

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.invitation_media_assets),
  1::bigint,
  'User A reads exactly their own media'
);

-- Bounded content constraints --------------------------------------------------
select throws_ok(
  $$
    select public.record_invitation_image(
      'a5100000-0000-4000-8000-000000000001',
      'a5200000-0000-4000-8000-000000000004',
      'hero', 'image/jpeg', 820000, 'not-a-valid-digest',
      'media/originals/v1/bad.jpg', 1600, 1200,
      jsonb_build_array(jsonb_build_object('width', 320, 'height', 240, 'byteLength', 12000, 'sha256', repeat('b', 64)))
    )
  $$,
  '23514', null, 'a malformed checksum is rejected'
);
select throws_ok(
  $$
    select public.record_invitation_image(
      'a5100000-0000-4000-8000-000000000001',
      'a5200000-0000-4000-8000-000000000005',
      'hero', 'image/gif', 820000, repeat('a', 64),
      'media/originals/v1/bad.gif', 1600, 1200,
      jsonb_build_array(jsonb_build_object('width', 320, 'height', 240, 'byteLength', 12000, 'sha256', repeat('b', 64)))
    )
  $$,
  '23514', null, 'an unsupported content type is rejected'
);
select throws_ok(
  $$
    select public.record_invitation_image(
      'a5100000-0000-4000-8000-000000000001',
      'a5200000-0000-4000-8000-000000000006',
      'hero', 'image/jpeg', 820000, repeat('a', 64),
      'media/originals/v1/tiny.jpg', 50, 50,
      jsonb_build_array(jsonb_build_object('width', 320, 'height', 240, 'byteLength', 12000, 'sha256', repeat('b', 64)))
    )
  $$,
  '23514', null, 'an out-of-bounds dimension is rejected'
);
select throws_ok(
  $$
    select public.record_invitation_image(
      'a5100000-0000-4000-8000-000000000001',
      'a5200000-0000-4000-8000-000000000007',
      'hero', 'image/jpeg', 820000, repeat('a', 64),
      'media/originals/v1/empty.jpg', 1600, 1200, '[]'::jsonb
    )
  $$,
  '23514', null, 'an empty rendition set is rejected'
);

-- Soft delete ------------------------------------------------------------------
select lives_ok(
  $$select public.soft_delete_invitation_image('a5200000-0000-4000-8000-000000000001')$$,
  'User A can soft delete their own image'
);
select is(
  (
    select status || ':' || (deleted_at is not null)::text
    from public.invitation_media_assets
    where id = 'a5200000-0000-4000-8000-000000000001'
  ),
  'deleted:true',
  'a soft-deleted image records its deletion time'
);

-- Cascade on invitation deletion ----------------------------------------------
select lives_ok(
  $$
    select public.record_invitation_image(
      'a5100000-0000-4000-8000-000000000001',
      'a5200000-0000-4000-8000-000000000002',
      'gallery', 'image/webp', 300000, repeat('a', 64),
      'media/originals/v1/a5200000-0000-4000-8000-000000000002.webp',
      1200, 900,
      jsonb_build_array(jsonb_build_object('width', 320, 'height', 240, 'byteLength', 9000, 'sha256', repeat('c', 64)))
    )
  $$,
  'User A can record a second image'
);
select lives_ok(
  $$select public.delete_unpublished_invitation('a5100000-0000-4000-8000-000000000001')$$,
  'User A can delete the unpublished invitation'
);

set local role postgres;
select is(
  (
    select count(*)
    from public.invitation_media_assets
    where invitation_id = 'a5100000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'deleting an invitation cascades its media rows'
);

select * from finish();
rollback;
