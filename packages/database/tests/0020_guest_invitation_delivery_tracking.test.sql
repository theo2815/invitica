begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(28);

-- Deliberately a runtime suite, not a catalog-only one. `0014`'s catalog-only suite
-- passed while `update_guest_party` was outright broken on hosted, because a PL/pgSQL
-- body is not resolved until it runs. These assertions call the functions.

create function pg_temp.tracking_document()
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
        'id', 'e4000000-0000-4000-8000-000000000001',
        'type', 'hero', 'visible', true, 'animationPreset', 'fade-in',
        'props', jsonb_build_object('title', 'Mara & Joaquin')
      )
    ),
    'assets', jsonb_build_array()
  )
$$;

create function pg_temp.tracking_snapshot()
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
    'document', pg_temp.tracking_document(),
    'assets', jsonb_build_array()
  )
$$;

-- Privileges first, while still `postgres`.

select ok(
  has_function_privilege(
    'authenticated', 'public.record_guest_invitation_copy(uuid)', 'execute'
  )
    and has_function_privilege(
      'authenticated', 'public.set_guest_invitation_sent(uuid,boolean)', 'execute'
    ),
  'authenticated creators can record a copy and set the sent mark'
);

select ok(
  not has_function_privilege('anon', 'public.record_guest_invitation_copy(uuid)', 'execute')
    and not has_function_privilege(
      'anon', 'public.set_guest_invitation_sent(uuid,boolean)', 'execute'
    )
    and not has_function_privilege(
      'service_role', 'public.record_guest_invitation_copy(uuid)', 'execute'
    )
    and not has_function_privilege(
      'service_role', 'public.set_guest_invitation_sent(uuid,boolean)', 'execute'
    ),
  'guests and the service boundary cannot touch delivery tracking'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.record_guest_invitation_copy(uuid)'::regprocedure
  )
    and (
      select prosecdef
      from pg_proc
      where oid = 'public.set_guest_invitation_sent(uuid,boolean)'::regprocedure
    ),
  'both tracking functions run through a security-definer ownership boundary'
);

select ok(
  not has_table_privilege('authenticated', 'public.guest_parties', 'update'),
  'creators still cannot write guest parties directly'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'guest_parties'
      and column_name in ('copy_count', 'first_copied_at', 'last_copied_at', 'marked_sent_at')
  ),
  4::bigint,
  'the four tracking columns exist on guest_parties'
);

-- Fixtures.

delete from auth.users
where id in (
  'e1000000-0000-4000-8000-000000000001'::uuid,
  'e2000000-0000-4000-8000-000000000002'::uuid
);
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'tracking-owner@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'e2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'tracking-stranger@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.ensure_personal_workspace()$$, 'the owner provisions a workspace');
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'e3000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Tracking invitation', 'wedding', 'Asia/Manila', 'en-PH',
      pg_temp.tracking_document()
    )
  $create$,
  'the owner creates the invitation fixture'
);
select lives_ok(
  $request$
    select set_config(
      'test.tracking_publication_id',
      public.request_invitation_publication(
        'e3000000-0000-4000-8000-000000000001', 1,
        'e5000000-0000-4000-8000-000000000001',
        pg_temp.tracking_snapshot()
      )::text,
      true
    )
  $request$,
  'the owner requests the publication fixture'
);

set local role service_role;
select lives_ok(
  format(
    'select public.start_invitation_publication(%1$L); select public.complete_invitation_publication(%1$L, %2$L, %3$L); select public.select_invitation_publication_delivery(%1$L); select public.confirm_invitation_publication_delivery(%1$L)',
    current_setting('test.tracking_publication_id'),
    'publication-artifacts/v1/e6000000-0000-4000-8000-000000000001.json',
    repeat('e', 64)
  ),
  'the service boundary delivers the invitation fixture'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $bulk$
    select public.create_guest_parties_bulk(
      'e3000000-0000-4000-8000-000000000001',
      'ea000000-0000-4000-8000-000000000001',
      repeat('1', 64),
      jsonb_build_array(
        jsonb_build_object(
          'partyId', 'e7000000-0000-4000-8000-000000000001',
          'linkId', 'e8000000-0000-4000-8000-000000000001',
          'internalLabel', 'Santos household', 'recipientName', 'Tita Lena and family',
          'capacity', 4, 'guestNames', jsonb_build_array('Lena Santos'),
          'tokenHash', repeat('a', 64), 'tokenCiphertext', repeat('A', 79),
          'tokenNonce', repeat('N', 16), 'encryptionKeyVersion', 1
        )
      )
    )
  $bulk$,
  'the owner creates the guest party fixture'
);

-- A brand-new party has been neither copied nor sent.

select is(
  (
    select copy_count
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  0,
  'a new party starts with no recorded copies'
);
select ok(
  (
    select first_copied_at is null and last_copied_at is null and marked_sent_at is null
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  'a new party has no copy or sent timestamps'
);

select lives_ok(
  $copy$select public.record_guest_invitation_copy('e7000000-0000-4000-8000-000000000001')$copy$,
  'the owner can record a copy'
);
select is(
  (
    select copy_count
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  1,
  'the first copy is counted'
);
select ok(
  (
    select first_copied_at is not null and last_copied_at is not null
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  'the first copy sets both timestamps'
);

-- The revision guards party edits, and a copy is not an edit: bumping it would make an
-- editor the creator already has open report a conflict they did not cause.
select is(
  (
    select revision
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'recording a copy does not bump the party revision'
);

select lives_ok(
  $again$
    select set_config(
      'test.tracking_first_copy',
      (
        select first_copied_at::text
        from public.guest_parties
        where id = 'e7000000-0000-4000-8000-000000000001'
      ),
      true
    );
    select public.record_guest_invitation_copy('e7000000-0000-4000-8000-000000000001');
  $again$,
  'the owner can record a second copy'
);
select is(
  (
    select copy_count
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  2,
  'the second copy increments the count'
);
select is(
  (
    select first_copied_at::text
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  current_setting('test.tracking_first_copy'),
  'the first-copied timestamp is never overwritten'
);

-- Copied is not sent. A creator may copy a message and never paste it, so the mark is
-- their own statement rather than an inference from copying.
select ok(
  (
    select marked_sent_at is null
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  'copying an invitation does not mark it as sent'
);

select lives_ok(
  $sent$select public.set_guest_invitation_sent('e7000000-0000-4000-8000-000000000001', true)$sent$,
  'the owner can mark a party as sent'
);
select ok(
  (
    select marked_sent_at is not null
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  'the sent mark is stored'
);

select lives_ok(
  $idempotent$
    select set_config(
      'test.tracking_sent_at',
      (
        select marked_sent_at::text
        from public.guest_parties
        where id = 'e7000000-0000-4000-8000-000000000001'
      ),
      true
    );
    select public.set_guest_invitation_sent('e7000000-0000-4000-8000-000000000001', true);
  $idempotent$,
  'marking an already-sent party again is harmless'
);
select is(
  (
    select marked_sent_at::text
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  current_setting('test.tracking_sent_at'),
  'a repeated sent mark keeps the original timestamp'
);

-- Reversible on purpose: a mis-tap would otherwise permanently mislabel a guest as
-- contacted, which is the very mistake this feature exists to prevent.
select lives_ok(
  $unsend$select public.set_guest_invitation_sent('e7000000-0000-4000-8000-000000000001', false)$unsend$,
  'the owner can undo the sent mark'
);
select ok(
  (
    select marked_sent_at is null and copy_count = 2
    from public.guest_parties
    where id = 'e7000000-0000-4000-8000-000000000001'
  ),
  'undoing the sent mark clears it without discarding the copy history'
);

-- A stranger owns no workspace containing this party.
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $stranger$select public.record_guest_invitation_copy('e7000000-0000-4000-8000-000000000001')$stranger$,
  'P0002',
  null,
  'a stranger cannot record a copy against another creator''s guest party'
);
select throws_ok(
  $stranger$select public.set_guest_invitation_sent('e7000000-0000-4000-8000-000000000001', true)$stranger$,
  'P0002',
  null,
  'a stranger cannot mark another creator''s guest party as sent'
);

select * from finish();
rollback;
