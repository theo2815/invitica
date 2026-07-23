begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(34);

create function pg_temp.garden_document(p_title text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'templateVersionId', '40000000-0000-4000-8000-000000000001',
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
        'id', 'c4000000-0000-4000-8000-000000000001',
        'type', 'hero',
        'visible', true,
        'animationPreset', 'fade-in',
        'props', jsonb_build_object('title', p_title)
      )
    ),
    'assets', jsonb_build_array()
  )
$$;

create function pg_temp.garden_snapshot(p_title text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'snapshotVersion', 1,
    'invitationSchemaVersion', 1,
    'rendererKey', 'garden-promise-v1',
    'rendererVersion', 1,
    'templateVersionId', '40000000-0000-4000-8000-000000000001',
    'templateVersion', 1,
    'draftRevision', 1,
    'document', pg_temp.garden_document(p_title),
    'assets', jsonb_build_array()
  )
$$;

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_guest_party(uuid,uuid,uuid,text,text,integer,text[],text)',
    'execute'
  ),
  'authenticated creators can create guest parties through the narrow RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.replace_guest_party_link(uuid,uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.revoke_guest_party_link(uuid)', 'execute'),
  'authenticated creators own link replacement and revocation transitions'
);
select ok(
  has_function_privilege('service_role', 'public.resolve_guest_party_link(text,text)', 'execute')
  and not has_function_privilege(
    'authenticated',
    'public.resolve_guest_party_link(text,text)',
    'execute'
  ),
  'only the service boundary can resolve a personalized token hash'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_guest_party(uuid,uuid,uuid,text,text,integer,text[],text)',
    'execute'
  )
  and not has_function_privilege('anon', 'public.revoke_guest_party_link(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.resolve_guest_party_link(text,text)', 'execute'),
  'anonymous sessions cannot call guest-party functions directly'
);
select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'guest_party_links'
      and column_name = 'token_hash'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'guest_party_links'
      and column_name = 'token'
  ),
  'the database stores a hash column and no raw token column'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.guest_parties'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.guests'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.guest_party_links'::regclass),
  'RLS is enabled across every creator-readable guest table'
);

delete from auth.users
where id in (
  'c1000000-0000-4000-8000-000000000001'::uuid,
  'c2000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'guest-owner-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'c2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'guest-owner-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User A can provision the guest-management workspace'
);
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'c3000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Guest party test invitation',
      'wedding',
      'Asia/Manila',
      'en-PH',
      pg_temp.garden_document('Mara & Joaquin')
    )
  $create$,
  'User A can create the publication-ready invitation'
);
select lives_ok(
  $request$
    select set_config(
      'test.guest_publication_id',
      public.request_invitation_publication(
        'c3000000-0000-4000-8000-000000000001',
        1,
        'c5000000-0000-4000-8000-000000000001',
        pg_temp.garden_snapshot('Mara & Joaquin')
      )::text,
      true
    )
  $request$,
  'User A can request the immutable invitation publication'
);

set local role service_role;
select lives_ok(
  format(
    'select public.start_invitation_publication(%1$L); select public.complete_invitation_publication(%1$L, %2$L, %3$L); select public.select_invitation_publication_delivery(%1$L); select public.confirm_invitation_publication_delivery(%1$L)',
    current_setting('test.guest_publication_id'),
    'publication-artifacts/v1/c6000000-0000-4000-8000-000000000001.json',
    repeat('c', 64)
  ),
  'the service boundary confirms a delivered invitation before guest setup'
);
select set_config(
  'test.guest_public_identifier',
  (select public_identifier from public.publication_aliases where invitation_id = 'c3000000-0000-4000-8000-000000000001'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $party$
    select public.create_guest_party(
      'c7000000-0000-4000-8000-000000000001',
      'c8000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      '  Santos household  ',
      '  Tita Lena and family  ',
      4,
      array[' Lena Santos ', 'Paolo Santos'],
      repeat('a', 64)
    )
  $party$,
  'the owner can atomically create a party, optional names, and its active link'
);
select is(
  (select internal_label from public.guest_parties where id = 'c7000000-0000-4000-8000-000000000001'),
  'Santos household',
  'the private organizer label is normalized'
);
select is(
  (select recipient_name from public.guest_parties where id = 'c7000000-0000-4000-8000-000000000001'),
  'Tita Lena and family',
  'the guest-visible envelope greeting is normalized separately'
);
select is(
  (
    select string_agg(name, '|' order by sort_order)
    from public.guests
    where guest_party_id = 'c7000000-0000-4000-8000-000000000001'
  ),
  'Lena Santos|Paolo Santos',
  'optional named guests retain deliberate order and trimmed values'
);
set local role postgres;
select ok(
  (
    select status = 'active' and token_hash = repeat('a', 64) and revoked_at is null
    from public.guest_party_links
    where guest_party_id = 'c7000000-0000-4000-8000-000000000001'
  ),
  'the initial link stores only its active keyed hash state'
);
set local role authenticated;
select throws_ok(
  $insert$
    insert into public.guest_parties (
      workspace_id, invitation_id, internal_label, recipient_name, capacity
    )
    select workspace_id, invitation_id, 'Bypass', 'Bypass', 1
    from public.guest_parties
    limit 1
  $insert$,
  '42501', null, 'creators cannot bypass the guest-party RPC with direct inserts'
);
select throws_ok(
  $capacity$
    select public.create_guest_party(
      'c7000000-0000-4000-8000-000000000002',
      'c8000000-0000-4000-8000-000000000002',
      'c3000000-0000-4000-8000-000000000001',
      'Too many names',
      'Too many names',
      1,
      array['One', 'Two'],
      repeat('d', 64)
    )
  $capacity$,
  '22023', null, 'named guests cannot exceed party capacity'
);

select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User B can provision an isolated workspace'
);
select throws_ok(
  $cross$
    select public.create_guest_party(
      'c7000000-0000-4000-8000-000000000003',
      'c8000000-0000-4000-8000-000000000003',
      'c3000000-0000-4000-8000-000000000001',
      'Cross workspace',
      'Cross workspace',
      1,
      array[]::text[],
      repeat('e', 64)
    )
  $cross$,
  'P0002', null, 'another workspace cannot add parties to User A invitation'
);
select is((select count(id) from public.guest_parties), 0::bigint, 'User B cannot read User A parties');
select is((select count(id) from public.guests), 0::bigint, 'User B cannot read User A named guests');
select is((select count(id) from public.guest_party_links), 0::bigint, 'User B cannot read User A link state');

set local role service_role;
select is(
  (
    select recipient_name
    from public.resolve_guest_party_link(current_setting('test.guest_public_identifier'), repeat('a', 64))
  ),
  'Tita Lena and family',
  'the service boundary resolves the active party only for the matching invitation alias'
);
select is(
  (
    select count(*)
    from public.resolve_guest_party_link(repeat('f', 32), repeat('a', 64))
  ),
  0::bigint,
  'a token cannot cross to another public invitation identifier'
);
select is(
  (
    select count(*)
    from public.resolve_guest_party_link(current_setting('test.guest_public_identifier'), repeat('9', 64))
  ),
  0::bigint,
  'an unknown token hash reveals no guest identity'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select ok(
  public.revoke_guest_party_link('c7000000-0000-4000-8000-000000000001'),
  'the owner can revoke the current personalized link'
);

set local role service_role;
select is(
  (
    select count(*)
    from public.resolve_guest_party_link(current_setting('test.guest_public_identifier'), repeat('a', 64))
  ),
  0::bigint,
  'a revoked link stops resolving immediately'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select is(
  public.revoke_guest_party_link('c7000000-0000-4000-8000-000000000001'),
  false,
  'repeated revocation is safely idempotent'
);
select lives_ok(
  $$select public.replace_guest_party_link('c7000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000004', repeat('b', 64))$$,
  'the owner can replace a revoked link with fresh token material'
);
set local role postgres;
select ok(
  (
    select count(*) = 2
      and count(*) filter (where status = 'active' and token_hash = repeat('b', 64)) = 1
      and count(*) filter (where status = 'revoked' and token_hash = repeat('a', 64)) = 1
    from public.guest_party_links
    where guest_party_id = 'c7000000-0000-4000-8000-000000000001'
  ),
  'replacement preserves revoked history and permits exactly one active link'
);

set local role service_role;
select is(
  (
    select recipient_name
    from public.resolve_guest_party_link(current_setting('test.guest_public_identifier'), repeat('b', 64))
  ),
  'Tita Lena and family',
  'the replacement link resolves the original party greeting'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.revoke_guest_party_link('c7000000-0000-4000-8000-000000000001')$$,
  'P0002', null, 'another workspace cannot revoke User A personalized link'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.revoke_guest_party_link('c7000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous revocation is denied'
);
select throws_ok(
  $$select count(*) from public.guest_parties$$,
  '42501',
  null,
  'anonymous sessions cannot read private guest parties'
);

set local role postgres;
select * from finish();
rollback;
