begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(17);

select has_table('public', 'terms_acceptances', 'creator Terms acceptance history exists');
select columns_are(
  'public',
  'terms_acceptances',
  array['id', 'user_id', 'terms_version', 'privacy_notice_version', 'accepted_at'],
  'acceptance stores versions and time without IP address or user agent'
);
select has_pk('public', 'terms_acceptances', 'acceptance rows have a primary key');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.terms_acceptances'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'c'
  ),
  'acceptance history follows account deletion'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.terms_acceptances'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) =
        'UNIQUE (user_id, terms_version, privacy_notice_version)'
  ),
  'one acceptance row exists per user and presented version pair'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.terms_acceptances'::regclass),
  'RLS is enabled on acceptance history'
);
select ok(
  has_table_privilege('authenticated', 'public.terms_acceptances', 'select'),
  'authenticated creators can read their RLS-filtered acceptance history'
);
select ok(
  has_column_privilege('authenticated', 'public.terms_acceptances', 'user_id', 'insert')
    and has_column_privilege(
      'authenticated',
      'public.terms_acceptances',
      'terms_version',
      'insert'
    )
    and has_column_privilege(
      'authenticated',
      'public.terms_acceptances',
      'privacy_notice_version',
      'insert'
    ),
  'authenticated creators can append only the acceptance inputs'
);
select ok(
  not has_column_privilege('authenticated', 'public.terms_acceptances', 'id', 'insert')
    and not has_column_privilege(
      'authenticated',
      'public.terms_acceptances',
      'accepted_at',
      'insert'
    )
    and not has_table_privilege('authenticated', 'public.terms_acceptances', 'update')
    and not has_table_privilege('authenticated', 'public.terms_acceptances', 'delete'),
  'the browser cannot forge timestamps or rewrite acceptance history'
);
select ok(
  not has_table_privilege('anon', 'public.terms_acceptances', 'select')
    and not has_table_privilege('anon', 'public.terms_acceptances', 'insert')
    and not has_table_privilege('service_role', 'public.terms_acceptances', 'select')
    and not has_table_privilege('service_role', 'public.terms_acceptances', 'insert'),
  'guest and service roles receive no acceptance-table privileges'
);

delete from auth.users
where id in (
  'd7100000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000002'
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
    'd7100000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'terms-owner@example.invalid',
    '',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'd7200000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'terms-stranger@example.invalid',
    '',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.terms_acceptances (
  user_id,
  terms_version,
  privacy_notice_version
)
values (
  'd7200000-0000-4000-8000-000000000002',
  '2026-08-01',
  '2026-08-01'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd7100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.terms_acceptances (
      user_id,
      terms_version,
      privacy_notice_version
    )
    values (
      'd7100000-0000-4000-8000-000000000001',
      '2026-08-01',
      '2026-08-01'
    )
  $$,
  'a creator can append their own current acceptance'
);
select ok(
  (
    select accepted_at between statement_timestamp() - interval '1 minute'
      and statement_timestamp() + interval '1 minute'
    from public.terms_acceptances
    where user_id = 'd7100000-0000-4000-8000-000000000001'
  ),
  'the database records the acceptance timestamp'
);
select is(
  (
    select count(*)
    from public.terms_acceptances
    where user_id = 'd7100000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'a creator can read their own acceptance'
);
select is(
  (
    select count(*)
    from public.terms_acceptances
    where user_id = 'd7200000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'a creator cannot read another account acceptance'
);
select throws_ok(
  $$
    insert into public.terms_acceptances (
      user_id,
      terms_version,
      privacy_notice_version
    )
    values (
      'd7200000-0000-4000-8000-000000000002',
      '2026-08-02',
      '2026-08-02'
    )
  $$,
  '42501',
  null,
  'a creator cannot append acceptance for another account'
);
select throws_ok(
  $$
    insert into public.terms_acceptances (
      user_id,
      terms_version,
      privacy_notice_version
    )
    values (
      'd7100000-0000-4000-8000-000000000001',
      'Invalid Version',
      '2026-08-02'
    )
  $$,
  '23514',
  null,
  'document versions stay bounded machine-readable identifiers'
);
select throws_ok(
  $$
    insert into public.terms_acceptances (
      user_id,
      terms_version,
      privacy_notice_version
    )
    values (
      'd7100000-0000-4000-8000-000000000001',
      '2026-08-01',
      '2026-08-01'
    )
  $$,
  '23505',
  null,
  'the same version pair cannot create duplicate history'
);

set local role postgres;
select * from finish();
rollback;
