begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(32);

create function pg_temp.rsvp_document(p_title text, p_deadline text)
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
        'id', 'd4000000-0000-4000-8000-000000000001', 'type', 'hero',
        'visible', true, 'animationPreset', 'fade-in',
        'props', jsonb_build_object('title', p_title)
      ),
      jsonb_build_object(
        'id', 'd4000000-0000-4000-8000-000000000002', 'type', 'rsvp',
        'visible', true, 'animationPreset', 'fade-up',
        'props', jsonb_build_object('heading', 'Will you join us?', 'deadline', p_deadline)
      )
    ),
    'assets', jsonb_build_array()
  )
$$;

create function pg_temp.rsvp_snapshot(p_title text, p_deadline text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'snapshotVersion', 1, 'invitationSchemaVersion', 1,
    'rendererKey', 'garden-promise-v1', 'rendererVersion', 1,
    'templateVersionId', '40000000-0000-4000-8000-000000000001',
    'templateVersion', 1, 'draftRevision', 1,
    'document', pg_temp.rsvp_document(p_title, p_deadline),
    'assets', jsonb_build_array()
  )
$$;

select ok(
  has_function_privilege('service_role', 'public.resolve_guest_rsvp_context(text,text)', 'execute')
  and has_function_privilege(
    'service_role',
    'public.submit_guest_rsvp(text,text,uuid,bigint,text,integer,text)',
    'execute'
  ),
  'only the service boundary receives RSVP resolver and mutation execution grants'
);
select ok(
  not has_function_privilege('authenticated', 'public.resolve_guest_rsvp_context(text,text)', 'execute')
  and not has_function_privilege(
    'anon',
    'public.submit_guest_rsvp(text,text,uuid,bigint,text,integer,text)',
    'execute'
  ),
  'browser database roles cannot call RSVP capability functions directly'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.rsvp_responses'::regclass),
  'RLS is enabled on RSVP responses'
);
select ok(
  not has_table_privilege('anon', 'public.rsvp_responses', 'select')
  and not has_table_privilege('authenticated', 'public.rsvp_responses', 'insert')
  and not has_table_privilege('authenticated', 'public.rsvp_responses', 'update'),
  'anonymous reads and direct browser writes are denied'
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
    'rsvp-owner-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'd2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'rsvp-owner-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.ensure_personal_workspace()$$, 'User A provisions an RSVP workspace');
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'd3000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Open RSVP invitation', 'wedding', 'Asia/Manila', 'en-PH',
      pg_temp.rsvp_document('Mara & Joaquin', '2099-12-01T00:00:00+08:00')
    )
  $create$,
  'User A creates an invitation with an open RSVP deadline'
);
select lives_ok(
  $request$
    select set_config(
      'test.rsvp_publication_id',
      public.request_invitation_publication(
        'd3000000-0000-4000-8000-000000000001', 1,
        'd5000000-0000-4000-8000-000000000001',
        pg_temp.rsvp_snapshot('Mara & Joaquin', '2099-12-01T00:00:00+08:00')
      )::text,
      true
    )
  $request$,
  'User A requests the immutable invitation publication'
);

set local role service_role;
select lives_ok(
  format(
    'select public.start_invitation_publication(%1$L); select public.complete_invitation_publication(%1$L, %2$L, %3$L); select public.select_invitation_publication_delivery(%1$L); select public.confirm_invitation_publication_delivery(%1$L)',
    current_setting('test.rsvp_publication_id'),
    'publication-artifacts/v1/d6000000-0000-4000-8000-000000000001.json',
    repeat('d', 64)
  ),
  'the service boundary confirms the delivered RSVP invitation'
);
select set_config(
  'test.rsvp_public_identifier',
  (select public_identifier from public.publication_aliases where invitation_id = 'd3000000-0000-4000-8000-000000000001'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_guest_party(
    'd7000000-0000-4000-8000-000000000001',
    'd8000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',
    'Santos household', 'Tita Lena and family', 4,
    array['Lena Santos', 'Paolo Santos'], repeat('a', 64)
  )$$,
  'the owner creates the RSVP party and active personalized link'
);

set local role service_role;
select is(
  (
    select recipient_name || '|' || party_capacity || '|' || can_respond || '|' || coalesce(response_revision, 0)
    from public.resolve_guest_rsvp_context(
      current_setting('test.rsvp_public_identifier'), repeat('a', 64)
    )
  ),
  'Tita Lena and family|4|true|0',
  'the active link resolves only its open party context without a response'
);
select is(
  (
    select count(*)
    from public.resolve_guest_rsvp_context(repeat('f', 32), repeat('a', 64))
  ),
  0::bigint,
  'the same token cannot resolve against another invitation identifier'
);
select lives_ok(
  $$select * from public.submit_guest_rsvp(
    current_setting('test.rsvp_public_identifier'), repeat('a', 64),
    'd9000000-0000-4000-8000-000000000001', 0,
    'attending', 3, '  We are excited to celebrate.  '
  )$$,
  'a valid personalized link submits its first response'
);
set local role postgres;
select is(
  (
    select attendance || '|' || attendee_count || '|' || message || '|' || revision
    from public.rsvp_responses
    where guest_party_id = 'd7000000-0000-4000-8000-000000000001'
  ),
  'attending|3|We are excited to celebrate.|1',
  'the response is normalized, party-scoped, and starts at revision one'
);
set local role service_role;
select is(
  (
    select response_revision
    from public.submit_guest_rsvp(
      current_setting('test.rsvp_public_identifier'), repeat('a', 64),
      'd9000000-0000-4000-8000-000000000001', 0,
      'attending', 3, 'We are excited to celebrate.'
    )
  ),
  1::bigint,
  'an exact retry returns the original response without incrementing its revision'
);
select throws_ok(
  $$select * from public.submit_guest_rsvp(
    current_setting('test.rsvp_public_identifier'), repeat('a', 64),
    'd9000000-0000-4000-8000-000000000001', 1,
    'attending', 2, 'Different input'
  )$$,
  '22023', null, 'a mutation UUID cannot be reused with different input'
);
select throws_ok(
  $$select * from public.submit_guest_rsvp(
    current_setting('test.rsvp_public_identifier'), repeat('a', 64),
    'd9000000-0000-4000-8000-000000000002', 0,
    'declined', 0, null
  )$$,
  '40001', null, 'a stale expected revision cannot overwrite the saved response'
);
select throws_ok(
  $$select * from public.submit_guest_rsvp(
    current_setting('test.rsvp_public_identifier'), repeat('a', 64),
    'd9000000-0000-4000-8000-000000000003', 1,
    'attending', 5, null
  )$$,
  '22023', null, 'an attending response cannot exceed party capacity'
);
select throws_ok(
  $$select * from public.submit_guest_rsvp(
    current_setting('test.rsvp_public_identifier'), repeat('a', 64),
    'd9000000-0000-4000-8000-000000000004', 1,
    'declined', 1, null
  )$$,
  '22023', null, 'a declined response cannot reserve attendees'
);
select lives_ok(
  $$select * from public.submit_guest_rsvp(
    current_setting('test.rsvp_public_identifier'), repeat('a', 64),
    'd9000000-0000-4000-8000-000000000005', 1,
    'declined', 0, ''
  )$$,
  'the active link can revise its response before the deadline'
);
set local role postgres;
select is(
  (
    select attendance || '|' || attendee_count || '|' || coalesce(message, 'none') || '|' || revision
    from public.rsvp_responses
    where guest_party_id = 'd7000000-0000-4000-8000-000000000001'
  ),
  'declined|0|none|2',
  'the revision replaces the party response without creating a duplicate'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$update public.rsvp_responses set attendee_count = 1$$,
  '42501', null, 'the creator cannot bypass the RSVP mutation RPC with a direct update'
);
select ok(
  public.revoke_guest_party_link('d7000000-0000-4000-8000-000000000001'),
  'the owner can revoke RSVP capability access'
);

set local role service_role;
select is(
  (
    select count(*) from public.resolve_guest_rsvp_context(
      current_setting('test.rsvp_public_identifier'), repeat('a', 64)
    )
  ),
  0::bigint,
  'revocation immediately stops response context resolution'
);
select throws_ok(
  $$select * from public.submit_guest_rsvp(
    current_setting('test.rsvp_public_identifier'), repeat('a', 64),
    'd9000000-0000-4000-8000-000000000006', 2,
    'attending', 2, null
  )$$,
  'P0002', null, 'a revoked link cannot revise the retained private response'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'd3000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001',
      'Closed RSVP invitation', 'wedding', 'Asia/Manila', 'en-PH',
      pg_temp.rsvp_document('Ana & Tomas', '2000-01-01T00:00:00+08:00')
    )
  $create$,
  'User A creates an invitation with a past RSVP deadline'
);
select lives_ok(
  $request$
    select set_config(
      'test.closed_rsvp_publication_id',
      public.request_invitation_publication(
        'd3000000-0000-4000-8000-000000000002', 1,
        'd5000000-0000-4000-8000-000000000002',
        pg_temp.rsvp_snapshot('Ana & Tomas', '2000-01-01T00:00:00+08:00')
      )::text,
      true
    )
  $request$,
  'User A requests the closed-deadline publication'
);

set local role service_role;
select lives_ok(
  format(
    'select public.start_invitation_publication(%1$L); select public.complete_invitation_publication(%1$L, %2$L, %3$L); select public.select_invitation_publication_delivery(%1$L); select public.confirm_invitation_publication_delivery(%1$L)',
    current_setting('test.closed_rsvp_publication_id'),
    'publication-artifacts/v1/d6000000-0000-4000-8000-000000000002.json',
    repeat('e', 64)
  ),
  'the service boundary confirms the closed-deadline invitation'
);
select set_config(
  'test.closed_rsvp_public_identifier',
  (select public_identifier from public.publication_aliases where invitation_id = 'd3000000-0000-4000-8000-000000000002'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_guest_party(
    'd7000000-0000-4000-8000-000000000002',
    'd8000000-0000-4000-8000-000000000002',
    'd3000000-0000-4000-8000-000000000002',
    'Closed party', 'Our dear friends', 2, array[]::text[], repeat('c', 64)
  )$$,
  'the owner creates a party for the closed invitation'
);

set local role service_role;
select is(
  (
    select can_respond from public.resolve_guest_rsvp_context(
      current_setting('test.closed_rsvp_public_identifier'), repeat('c', 64)
    )
  ),
  false,
  'the delivered immutable deadline closes the resolved RSVP context'
);
select throws_ok(
  $$select * from public.submit_guest_rsvp(
    current_setting('test.closed_rsvp_public_identifier'), repeat('c', 64),
    'd9000000-0000-4000-8000-000000000007', 0,
    'attending', 1, null
  )$$,
  'P0001', null, 'the database rejects a first response after the published deadline'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.ensure_personal_workspace()$$, 'User B provisions an isolated workspace');
select is(
  (select count(*) from public.rsvp_responses),
  0::bigint,
  'another workspace cannot read User A RSVP responses'
);

set local role postgres;
select * from finish();
rollback;
