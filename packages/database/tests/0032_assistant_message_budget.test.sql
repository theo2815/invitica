begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(14);

-- Privilege surface. This is the one budget function a creator's own browser session
-- reaches, so the grant is the mirror image of `0019`'s.

select ok(
  has_function_privilege('authenticated', 'public.consume_assistant_message()', 'execute'),
  'a signed-in creator may consume their own assistant allowance'
);

select ok(
  not has_function_privilege('anon', 'public.consume_assistant_message()', 'execute')
    and not has_function_privilege('service_role', 'public.consume_assistant_message()', 'execute'),
  'guests and the service-role client cannot consume assistant budget'
);

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.consume_assistant_message()'::regprocedure
  ),
  true,
  'the assistant budget runs through a security-definer boundary'
);

select ok(
  not has_table_privilege('anon', 'public.assistant_message_budget', 'select')
    and not has_table_privilege('authenticated', 'public.assistant_message_budget', 'select')
    and not has_table_privilege('service_role', 'public.assistant_message_budget', 'select'),
  'no client role can read the assistant budget counters'
);

delete from auth.users
where id in (
  'b1000000-0000-4000-8000-000000000001'::uuid,
  'b2000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'assistant-budget-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'assistant-budget-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

-- Behaviour. `0013` and `0014` both installed cleanly and failed on their first real
-- call because their suites only inspected the catalog, so every assertion below
-- invokes the function.

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select is(
  public.consume_assistant_message(),
  'unauthenticated',
  'a caller with no subject claim is refused rather than billed'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

select is(
  public.consume_assistant_message(),
  'allowed',
  'the first message of the day is within budget'
);

select is(
  (
    select bool_and(public.consume_assistant_message() = 'allowed')
    from generate_series(2, 20)
  ),
  true,
  'messages up to the twentieth stay within budget'
);

select is(
  public.consume_assistant_message(),
  'creator_daily_limit',
  'the twenty-first message in a day names the per-creator ceiling'
);

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);

select is(
  public.consume_assistant_message(),
  'allowed',
  'a second creator keeps their own daily allowance'
);

set local role postgres;

select is(
  (
    select message_count
    from public.assistant_message_budget
    where bucket_key = 'creator:b1000000-0000-4000-8000-000000000001'
  ),
  21,
  'an exhausted creator holds exactly one row per day, not one per message'
);

select is(
  (
    select window_start
    from public.assistant_message_budget
    where bucket_key = 'creator:b1000000-0000-4000-8000-000000000001'
  ),
  date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila',
  'the daily allowance resets at Manila midnight, not UTC midnight'
);

select is(
  (
    select message_count
    from public.assistant_message_budget
    where bucket_key = 'global'
  ),
  21,
  'the refused message never reached the global monthly ceiling'
);

-- The global ceiling is 3,000 a month, so the counter is moved to the boundary rather
-- than reached by three thousand calls. Creator B has spent one of twenty today, so a
-- refusal here can only come from the global ceiling.
update public.assistant_message_budget
set message_count = 3000
where bucket_key = 'global';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);

select is(
  public.consume_assistant_message(),
  'global_monthly_limit',
  'a creator inside their own allowance is still stopped by the global monthly ceiling'
);

set local role postgres;

select throws_ok(
  $$
    insert into public.assistant_message_budget (bucket_key, window_start)
    values ('creator:not-a-uuid', now())
  $$,
  '23514',
  null,
  'a creator bucket key that is not a user id is rejected'
);

select * from finish();
rollback;
