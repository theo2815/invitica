begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(20);

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_guest_parties_page(uuid,text,text,integer,integer)',
    'execute'
  ),
  'authenticated creators can request a bounded guest-party page'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_guest_parties_page(uuid,text,text,integer,integer)',
    'execute'
  )
    and not has_function_privilege(
      'service_role',
      'public.list_guest_parties_page(uuid,text,text,integer,integer)',
      'execute'
    ),
  'guest and service roles cannot read the creator guest ledger'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.list_guest_parties_page(uuid,text,text,integer,integer)'::regprocedure
  ),
  'the page function enforces ownership through a security-definer boundary'
);

delete from auth.users
where id in (
  'f0100000-0000-4000-8000-000000000001'::uuid,
  'f0200000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    'f0100000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'pagination-owner@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'f0200000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'pagination-stranger@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.workspaces (id, personal_owner_user_id, name)
values (
  'f0300000-0000-4000-8000-000000000003',
  'f0100000-0000-4000-8000-000000000001',
  'Pagination workspace'
);

insert into public.workspace_members (workspace_id, user_id, role, status)
values (
  'f0300000-0000-4000-8000-000000000003',
  'f0100000-0000-4000-8000-000000000001',
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
  'f0400000-0000-4000-8000-000000000004',
  'f0300000-0000-4000-8000-000000000003',
  'Pagination event',
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
values (
  'f0500000-0000-4000-8000-000000000005',
  'f0300000-0000-4000-8000-000000000003',
  'f0400000-0000-4000-8000-000000000004',
  '40000000-0000-4000-8000-000000000001',
  'draft'
);

insert into public.guest_parties (
  id,
  workspace_id,
  invitation_id,
  internal_label,
  recipient_name,
  capacity,
  created_at
)
select
  ('f1000000-0000-4000-8000-' || lpad(party_number::text, 12, '0'))::uuid,
  'f0300000-0000-4000-8000-000000000003'::uuid,
  'f0500000-0000-4000-8000-000000000005'::uuid,
  case
    when party_number = 1 then 'Abella sent party'
    else 'Party ' || lpad(party_number::text, 2, '0')
  end,
  'Recipient ' || party_number,
  2,
  '2026-07-01T00:00:00+08:00'::timestamptz + make_interval(mins => party_number)
from generate_series(1, 25) as fixture(party_number);

update public.guest_parties
set marked_sent_at = '2026-07-26T10:00:00+08:00'
where id = 'f1000000-0000-4000-8000-000000000001';

insert into public.guests (
  id,
  workspace_id,
  invitation_id,
  guest_party_id,
  name,
  sort_order
)
select
  ('f2000000-0000-4000-8000-' || lpad(party_number::text, 12, '0'))::uuid,
  'f0300000-0000-4000-8000-000000000003'::uuid,
  'f0500000-0000-4000-8000-000000000005'::uuid,
  ('f1000000-0000-4000-8000-' || lpad(party_number::text, 12, '0'))::uuid,
  case when party_number = 7 then 'Needle Navarro' else 'Guest ' || party_number end,
  1
from generate_series(1, 25) as fixture(party_number);

insert into public.guest_party_links (
  id,
  workspace_id,
  invitation_id,
  guest_party_id,
  token_hash,
  status
)
select
  ('f3000000-0000-4000-8000-' || lpad(party_number::text, 12, '0'))::uuid,
  'f0300000-0000-4000-8000-000000000003'::uuid,
  'f0500000-0000-4000-8000-000000000005'::uuid,
  ('f1000000-0000-4000-8000-' || lpad(party_number::text, 12, '0'))::uuid,
  md5(party_number::text) || md5('pagination-' || party_number),
  'active'
from generate_series(1, 25) as fixture(party_number);

insert into public.rsvp_responses (
  id,
  workspace_id,
  invitation_id,
  guest_party_id,
  attendance,
  attendee_count,
  message,
  last_mutation_id,
  created_at,
  updated_at
)
values
  (
    'f4000000-0000-4000-8000-000000000002',
    'f0300000-0000-4000-8000-000000000003',
    'f0500000-0000-4000-8000-000000000005',
    'f1000000-0000-4000-8000-000000000002',
    'attending',
    2,
    'We will be there.',
    'f5000000-0000-4000-8000-000000000002',
    '2026-07-25T09:00:00+08:00',
    '2026-07-25T09:00:00+08:00'
  ),
  (
    'f4000000-0000-4000-8000-000000000003',
    'f0300000-0000-4000-8000-000000000003',
    'f0500000-0000-4000-8000-000000000005',
    'f1000000-0000-4000-8000-000000000003',
    'declined',
    0,
    null,
    'f5000000-0000-4000-8000-000000000003',
    '2026-07-24T09:00:00+08:00',
    '2026-07-24T09:00:00+08:00'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'all',
      0,
      20
    )
  ),
  20::bigint,
  'the first page is bounded to the requested size'
);

select is(
  (
    select id
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'all',
      0,
      20
    )
    limit 1
  ),
  'f1000000-0000-4000-8000-000000000002'::uuid,
  'whole-result sorting puts unsent parties first and then the latest RSVP'
);

select is(
  (
    select count(*)
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'all',
      20,
      20
    )
  ),
  5::bigint,
  'the second page contains only the remaining parties'
);

select is(
  (
    select id
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'all',
      24,
      1
    )
  ),
  'f1000000-0000-4000-8000-000000000001'::uuid,
  'the sent party remains below every unsent party across page boundaries'
);

select is(
  (
    select count(*)
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      'needle',
      'all',
      0,
      20
    )
  ),
  1::bigint,
  'search considers named guests outside the initially visible page'
);

select is(
  (
    select guest_members -> 0 ->> 'name'
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      'needle',
      'all',
      0,
      20
    )
  ),
  'Needle Navarro',
  'the page returns ordered named-guest details'
);

select is(
  (
    select count(*)
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      'recipient 8',
      'all',
      0,
      20
    )
  ),
  1::bigint,
  'search also covers the envelope recipient'
);

select is(
  (
    select count(*)
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'already-sent',
      0,
      51
    )
  ),
  1::bigint,
  'Already Sent filters the complete party set'
);

select is(
  (
    select count(*)
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'not-yet-sent',
      0,
      51
    )
  ),
  24::bigint,
  'Not Yet Sent filters the complete party set'
);

select is(
  (
    select count(*)
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'attending',
      0,
      51
    )
  ),
  1::bigint,
  'Attending filters the complete party set'
);

select is(
  (
    select count(*)
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'declined',
      0,
      51
    )
  ),
  1::bigint,
  'Declined filters the complete party set'
);

select is(
  (
    select count(*)
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'awaiting',
      0,
      51
    )
  ),
  23::bigint,
  'Awaiting filters the complete party set'
);

select is(
  (
    select link_status
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      'needle',
      'all',
      0,
      20
    )
  ),
  'active',
  'the bounded page still returns the party link state'
);

select throws_ok(
  $invalid$
    select *
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'unknown',
      0,
      20
    )
  $invalid$,
  '22023',
  null,
  'unsupported filters are rejected'
);

select throws_ok(
  $invalid$
    select *
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'all',
      0,
      52
    )
  $invalid$,
  '22023',
  null,
  'unbounded page sizes are rejected'
);

select set_config('request.jwt.claim.sub', 'f0200000-0000-4000-8000-000000000002', true);
select throws_ok(
  $stranger$
    select *
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'all',
      0,
      20
    )
  $stranger$,
  'P0002',
  null,
  'another user cannot page through the owner guest ledger'
);

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $anonymous$
    select *
    from public.list_guest_parties_page(
      'f0500000-0000-4000-8000-000000000005',
      '',
      'all',
      0,
      20
    )
  $anonymous$,
  '42501',
  null,
  'an unauthenticated request is rejected inside the function'
);

select * from finish();
rollback;
