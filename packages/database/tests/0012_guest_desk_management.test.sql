begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(29);

create function pg_temp.guest_desk_document()
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
        'background', '#e8eadf', 'surface', '#fffdf6', 'text', '#344033',
        'accent', '#687a5a', 'accentContrast', '#ffffff'
      ),
      'typography', jsonb_build_object(
        'headingFontId', 'fraunces', 'bodyFontId', 'instrument-sans'
      ),
      'spacingScale', 'spacious'
    ),
    'opening', jsonb_build_object(
      'preset', 'ribbon-envelope-letter', 'motionStyle', 'elegant',
      'recipientMode', 'personalized', 'fallbackRecipientText', 'Our dear guest'
    ),
    'sections', jsonb_build_array(
      jsonb_build_object(
        'id', 'd4000000-0000-4000-8000-000000000001',
        'type', 'hero', 'visible', true, 'animationPreset', 'fade-in',
        'props', jsonb_build_object('title', 'Mara & Joaquin')
      )
    ),
    'assets', jsonb_build_array()
  )
$$;

create function pg_temp.guest_desk_snapshot()
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
    'document', pg_temp.guest_desk_document(),
    'assets', jsonb_build_array()
  )
$$;

select ok(
  has_function_privilege('authenticated', 'public.create_guest_parties_bulk(uuid,uuid,text,jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.get_guest_party_link_secret(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.remove_guest_member(uuid,uuid,bigint)', 'execute')
    and has_function_privilege('authenticated', 'public.trash_guest_party(uuid,bigint)', 'execute')
    and has_function_privilege('authenticated', 'public.restore_guest_party(uuid,bigint)', 'execute'),
  'authenticated creators can execute the narrow guest-desk RPCs'
);
select ok(
  not has_function_privilege('anon', 'public.create_guest_parties_bulk(uuid,uuid,text,jsonb)', 'execute')
    and not has_function_privilege('service_role', 'public.get_guest_party_link_secret(uuid)', 'execute'),
  'anonymous and service roles cannot use creator guest-desk capabilities'
);
select ok(
  not has_column_privilege('authenticated', 'public.guest_party_links', 'token_ciphertext', 'select')
    and not has_column_privilege('authenticated', 'public.guest_party_links', 'token_nonce', 'select')
    and not has_column_privilege('authenticated', 'public.guest_parties', 'creation_request_hash', 'select'),
  'recoverable secrets and mutation metadata remain outside direct authenticated reads'
);

delete from auth.users
where id in (
  'd1000000-0000-4000-8000-000000000001'::uuid,
  'd2000000-0000-4000-8000-000000000002'::uuid
);
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'guest-desk-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'd2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'guest-desk-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.ensure_personal_workspace()$$, 'User A can provision a workspace');
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'd3000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Guest desk invitation', 'wedding', 'Asia/Manila', 'en-PH',
      pg_temp.guest_desk_document()
    )
  $create$,
  'User A can create the invitation fixture'
);
select lives_ok(
  $request$
    select set_config(
      'test.guest_desk_publication_id',
      public.request_invitation_publication(
        'd3000000-0000-4000-8000-000000000001', 1,
        'd5000000-0000-4000-8000-000000000001',
        pg_temp.guest_desk_snapshot()
      )::text,
      true
    )
  $request$,
  'User A can request the publication fixture'
);

set local role service_role;
select lives_ok(
  format(
    'select public.start_invitation_publication(%1$L); select public.complete_invitation_publication(%1$L, %2$L, %3$L); select public.select_invitation_publication_delivery(%1$L); select public.confirm_invitation_publication_delivery(%1$L)',
    current_setting('test.guest_desk_publication_id'),
    'publication-artifacts/v1/d6000000-0000-4000-8000-000000000001.json',
    repeat('d', 64)
  ),
  'the service boundary delivers the invitation fixture'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $bulk$
    select public.create_guest_parties_bulk(
      'd3000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000001',
      repeat('1', 64),
      jsonb_build_array(
        jsonb_build_object(
          'partyId', 'd7000000-0000-4000-8000-000000000001',
          'linkId', 'd8000000-0000-4000-8000-000000000001',
          'internalLabel', 'Santos household', 'recipientName', 'Tita Lena and family',
          'capacity', 4, 'guestNames', jsonb_build_array('Lena Santos', 'Paolo Santos'),
          'tokenHash', repeat('a', 64), 'tokenCiphertext', repeat('A', 79),
          'tokenNonce', repeat('N', 16), 'encryptionKeyVersion', 1
        ),
        jsonb_build_object(
          'partyId', 'd7000000-0000-4000-8000-000000000002',
          'linkId', 'd8000000-0000-4000-8000-000000000002',
          'internalLabel', 'John Reyes', 'recipientName', 'John Reyes',
          'capacity', 1, 'guestNames', jsonb_build_array('John Reyes'),
          'tokenHash', repeat('b', 64), 'tokenCiphertext', repeat('B', 79),
          'tokenNonce', repeat('M', 16), 'encryptionKeyVersion', 1
        )
      )
    )
  $bulk$,
  'the owner can create multiple guest parties atomically'
);
select is((select count(*) from public.guest_parties), 2::bigint, 'the batch creates two parties');
select is((select count(*) from public.guests), 3::bigint, 'the batch creates all named guests');
select is(
  (select count(*) from public.guest_party_links where status = 'active'),
  2::bigint,
  'the batch creates one active recoverable link per party'
);
select lives_ok(
  $retry$
    select public.create_guest_parties_bulk(
      'd3000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000001', repeat('1', 64),
      jsonb_build_array(jsonb_build_object(), jsonb_build_object())
    )
  $retry$,
  'a retry with the same mutation fingerprint returns the existing party identifiers'
);
select is((select count(*) from public.guest_parties), 2::bigint, 'the retry creates no duplicates');
select throws_ok(
  $conflict$
    select public.create_guest_parties_bulk(
      'd3000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000001', repeat('2', 64),
      jsonb_build_array(jsonb_build_object(), jsonb_build_object())
    )
  $conflict$,
  '23505',
  'Guest-party mutation key was reused with different input',
  'a mutation key cannot be reused with different input'
);
select is(
  (select recipient_name from public.get_guest_party_link_secret('d7000000-0000-4000-8000-000000000001')),
  'Tita Lena and family',
  'the owner can retrieve the intended party greeting through the narrow secret RPC'
);
select is(
  (select token_ciphertext from public.get_guest_party_link_secret('d7000000-0000-4000-8000-000000000001')),
  repeat('A', 79),
  'the secret RPC returns the recoverable ciphertext without exposing it in table privileges'
);
select lives_ok(
  $$select public.remove_guest_member('d7000000-0000-4000-8000-000000000001', (select id from public.guests where name = 'Paolo Santos'), 1)$$,
  'the owner can remove one named guest with the current revision'
);
select is(
  (select revision from public.guest_parties where id = 'd7000000-0000-4000-8000-000000000001'),
  2::bigint,
  'member removal advances the party revision'
);
select throws_ok(
  $$select public.remove_guest_member('d7000000-0000-4000-8000-000000000001', (select id from public.guests where name = 'Lena Santos'), 1)$$,
  '40001', 'Guest party revision conflict', 'stale member removal cannot overwrite newer state'
);
select lives_ok(
  $$select public.trash_guest_party('d7000000-0000-4000-8000-000000000001', 2)$$,
  'the owner can move a current party to trash'
);
select is((select count(*) from public.guest_parties where archived_at is null), 1::bigint, 'trashed parties leave the active ledger');
set local role postgres;
select ok(
  exists (
    select 1 from public.guest_party_links
    where guest_party_id = 'd7000000-0000-4000-8000-000000000001'
      and status = 'revoked' and token_ciphertext is null and token_nonce is null
  ),
  'trashing revokes the link and destroys recoverable token material'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.restore_guest_party('d7000000-0000-4000-8000-000000000001', 3)$$,
  'the owner can restore a party at its current revision'
);
select is(
  (select status from public.guest_party_links where guest_party_id = 'd7000000-0000-4000-8000-000000000001'),
  'revoked',
  'restoring a party does not silently reactivate its private capability'
);

select lives_ok($$select public.revoke_guest_party_link('d7000000-0000-4000-8000-000000000002')$$, 'normal link revocation succeeds');
set local role postgres;
select ok(
  exists (
    select 1 from public.guest_party_links
    where guest_party_id = 'd7000000-0000-4000-8000-000000000002'
      and status = 'revoked' and token_ciphertext is null and encryption_key_version is null
  ),
  'normal revocation also destroys recoverable token material'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.ensure_personal_workspace()$$, 'User B can provision a separate workspace');
select is(
  (select count(*) from public.get_guest_party_link_secret('d7000000-0000-4000-8000-000000000001')),
  0::bigint,
  'another owner cannot retrieve User A private link material'
);
select throws_ok(
  $$select public.trash_guest_party('d7000000-0000-4000-8000-000000000001', 4)$$,
  'P0002', 'Guest party not found', 'another owner cannot trash User A party'
);

select * from finish();
rollback;
