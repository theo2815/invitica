begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(15);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_guest_party_link_secrets(uuid,uuid[])',
    'execute'
  ),
  'authenticated creators can recover a bounded private-link batch'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_guest_party_link_secrets(uuid,uuid[])',
    'execute'
  )
    and not has_function_privilege(
      'service_role',
      'public.get_guest_party_link_secrets(uuid,uuid[])',
      'execute'
    ),
  'guest and service roles cannot recover creator private links'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.get_guest_party_link_secrets(uuid,uuid[])'::regprocedure
  ),
  'the batch read uses a security-definer ownership boundary'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.get_guest_party_link_secrets(uuid,uuid[])'::regprocedure
  ),
  array['search_path=""']::text[],
  'the security-definer function pins an empty search path'
);

delete from auth.users
where id in (
  'c0100000-0000-4000-8000-000000000001'::uuid,
  'c0200000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    'c0100000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'batch-owner@example.invalid',
    '',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'c0200000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'batch-stranger@example.invalid',
    '',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.workspaces (id, personal_owner_user_id, name)
values (
  'c0300000-0000-4000-8000-000000000003',
  'c0100000-0000-4000-8000-000000000001',
  'Batch recovery workspace'
);

insert into public.workspace_members (workspace_id, user_id, role, status)
values (
  'c0300000-0000-4000-8000-000000000003',
  'c0100000-0000-4000-8000-000000000001',
  'owner',
  'active'
);

insert into public.events (
  id,
  workspace_id,
  name,
  occasion,
  event_timezone,
  locale
)
values (
  'c0400000-0000-4000-8000-000000000004',
  'c0300000-0000-4000-8000-000000000003',
  'Batch recovery event',
  'wedding',
  'Asia/Manila',
  'en-PH'
);

insert into public.invitations (
  id,
  workspace_id,
  event_id,
  template_version_id,
  status
)
values
  (
    'c0500000-0000-4000-8000-000000000005',
    'c0300000-0000-4000-8000-000000000003',
    'c0400000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000001',
    'draft'
  ),
  (
    'c0500000-0000-4000-8000-000000000006',
    'c0300000-0000-4000-8000-000000000003',
    'c0400000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000001',
    'draft'
  );

insert into public.publication_versions (
  id,
  workspace_id,
  invitation_id,
  publication_number,
  idempotency_key,
  snapshot_version,
  invitation_schema_version,
  renderer_key,
  renderer_version,
  template_version_id,
  template_version,
  draft_revision,
  snapshot
)
values (
  'c0600000-0000-4000-8000-000000000006',
  'c0300000-0000-4000-8000-000000000003',
  'c0500000-0000-4000-8000-000000000005',
  1,
  'c0700000-0000-4000-8000-000000000007',
  1,
  1,
  'garden-promise-v1',
  1,
  '40000000-0000-4000-8000-000000000001',
  1,
  1,
  jsonb_build_object(
    'snapshotVersion', 1,
    'invitationSchemaVersion', 1,
    'rendererKey', 'garden-promise-v1',
    'rendererVersion', 1,
    'templateVersionId', '40000000-0000-4000-8000-000000000001',
    'templateVersion', 1,
    'draftRevision', 1,
    'document', jsonb_build_object(
      'schemaVersion', 1,
      'templateVersionId', '40000000-0000-4000-8000-000000000001'
    ),
    'assets', jsonb_build_array()
  )
);

insert into public.publication_aliases (
  workspace_id,
  invitation_id,
  public_identifier,
  active_publication_id,
  delivered_publication_id,
  delivery_status,
  delivered_at
)
values (
  'c0300000-0000-4000-8000-000000000003',
  'c0500000-0000-4000-8000-000000000005',
  repeat('c', 32),
  'c0600000-0000-4000-8000-000000000006',
  'c0600000-0000-4000-8000-000000000006',
  'delivered',
  now()
);

insert into public.guest_parties (
  id,
  workspace_id,
  invitation_id,
  internal_label,
  recipient_name,
  capacity,
  archived_at
)
values
  (
    'c1000000-0000-4000-8000-000000000001',
    'c0300000-0000-4000-8000-000000000003',
    'c0500000-0000-4000-8000-000000000005',
    'First active party',
    'First recipient',
    2,
    null
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'c0300000-0000-4000-8000-000000000003',
    'c0500000-0000-4000-8000-000000000005',
    'Second active party',
    'Second recipient',
    2,
    null
  ),
  (
    'c1000000-0000-4000-8000-000000000003',
    'c0300000-0000-4000-8000-000000000003',
    'c0500000-0000-4000-8000-000000000005',
    'Revoked party',
    'Revoked recipient',
    1,
    null
  ),
  (
    'c1000000-0000-4000-8000-000000000004',
    'c0300000-0000-4000-8000-000000000003',
    'c0500000-0000-4000-8000-000000000005',
    'Archived party',
    'Archived recipient',
    1,
    now()
  ),
  (
    'c1000000-0000-4000-8000-000000000005',
    'c0300000-0000-4000-8000-000000000003',
    'c0500000-0000-4000-8000-000000000006',
    'Other invitation party',
    'Other recipient',
    1,
    null
  );

insert into public.guest_party_links (
  id,
  workspace_id,
  invitation_id,
  guest_party_id,
  token_hash,
  status,
  revoked_at,
  token_ciphertext,
  token_nonce,
  encryption_key_version
)
values
  (
    'c2000000-0000-4000-8000-000000000001',
    'c0300000-0000-4000-8000-000000000003',
    'c0500000-0000-4000-8000-000000000005',
    'c1000000-0000-4000-8000-000000000001',
    repeat('1', 64),
    'active',
    null,
    repeat('A', 79),
    repeat('N', 16),
    1
  ),
  (
    'c2000000-0000-4000-8000-000000000002',
    'c0300000-0000-4000-8000-000000000003',
    'c0500000-0000-4000-8000-000000000005',
    'c1000000-0000-4000-8000-000000000002',
    repeat('2', 64),
    'active',
    null,
    repeat('B', 79),
    repeat('O', 16),
    1
  ),
  (
    'c2000000-0000-4000-8000-000000000003',
    'c0300000-0000-4000-8000-000000000003',
    'c0500000-0000-4000-8000-000000000005',
    'c1000000-0000-4000-8000-000000000003',
    repeat('3', 64),
    'revoked',
    now(),
    repeat('C', 79),
    repeat('P', 16),
    1
  ),
  (
    'c2000000-0000-4000-8000-000000000004',
    'c0300000-0000-4000-8000-000000000003',
    'c0500000-0000-4000-8000-000000000005',
    'c1000000-0000-4000-8000-000000000004',
    repeat('4', 64),
    'active',
    null,
    repeat('D', 79),
    repeat('Q', 16),
    1
  ),
  (
    'c2000000-0000-4000-8000-000000000005',
    'c0300000-0000-4000-8000-000000000003',
    'c0500000-0000-4000-8000-000000000006',
    'c1000000-0000-4000-8000-000000000005',
    repeat('5', 64),
    'active',
    null,
    repeat('E', 79),
    repeat('R', 16),
    1
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $query$
    select guest_party_id
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array[
        'c1000000-0000-4000-8000-000000000002',
        'c1000000-0000-4000-8000-000000000001'
      ]::uuid[]
    )
  $query$,
  $expected$
    values
      ('c1000000-0000-4000-8000-000000000002'::uuid),
      ('c1000000-0000-4000-8000-000000000001'::uuid)
  $expected$,
  'the batch preserves the requested party order'
);

select is(
  (
    select token_ciphertext
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array['c1000000-0000-4000-8000-000000000001']::uuid[]
    )
  ),
  repeat('A', 79),
  'the owner receives the recoverable encrypted token material'
);

select is(
  (
    select count(*)
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array['c1000000-0000-4000-8000-000000000005']::uuid[]
    )
  ),
  0::bigint,
  'a party from another invitation is omitted'
);

select is(
  (
    select count(*)
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array['c1000000-0000-4000-8000-000000000003']::uuid[]
    )
  ),
  0::bigint,
  'a revoked private link is omitted'
);

select is(
  (
    select count(*)
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array['c1000000-0000-4000-8000-000000000004']::uuid[]
    )
  ),
  0::bigint,
  'an archived party is omitted'
);

select set_config('request.jwt.claim.sub', 'c0200000-0000-4000-8000-000000000002', true);
select is(
  (
    select count(*)
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array['c1000000-0000-4000-8000-000000000001']::uuid[]
    )
  ),
  0::bigint,
  'a non-owner cannot recover the private link'
);

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $unauth$
    select *
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array['c1000000-0000-4000-8000-000000000001']::uuid[]
    )
  $unauth$,
  '42501',
  'Authentication required',
  'an unauthenticated call is rejected'
);

select set_config('request.jwt.claim.sub', 'c0100000-0000-4000-8000-000000000001', true);
select throws_ok(
  $empty$
    select *
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array[]::uuid[]
    )
  $empty$,
  '22023',
  'Invalid guest link batch',
  'an empty batch is rejected'
);

select throws_ok(
  $duplicate$
    select *
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array[
        'c1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000001'
      ]::uuid[]
    )
  $duplicate$,
  '22023',
  'Invalid guest link batch',
  'duplicate party ids are rejected'
);

select throws_ok(
  $oversized$
    select *
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array_fill('c1000000-0000-4000-8000-000000000001'::uuid, array[51])
    )
  $oversized$,
  '22023',
  'Invalid guest link batch',
  'a batch over fifty ids is rejected'
);

select throws_ok(
  $null$
    select *
    from public.get_guest_party_link_secrets(
      'c0500000-0000-4000-8000-000000000005',
      array[null]::uuid[]
    )
  $null$,
  '22023',
  'Invalid guest link batch',
  'a null party id is rejected'
);

select * from finish();
rollback;
