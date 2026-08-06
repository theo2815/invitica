begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(13);

-- Privilege surface. This is a read-only door onto the counters `0032` closed, so it
-- must open exactly as far as the spending function and no further.

select ok(
  has_function_privilege('authenticated', 'public.assistant_message_usage()', 'execute'),
  'a signed-in creator may read their own assistant usage'
);

select ok(
  not has_function_privilege('anon', 'public.assistant_message_usage()', 'execute')
    and not has_function_privilege('service_role', 'public.assistant_message_usage()', 'execute'),
  'guests and the service-role client cannot read assistant usage'
);

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.assistant_message_usage()'::regprocedure
  ),
  true,
  'assistant usage runs through a security-definer boundary'
);

-- The reader must not reopen the table itself. `0032` revoked it from every client
-- role and this migration does not change that.
select ok(
  not has_table_privilege('anon', 'public.assistant_message_budget', 'select')
    and not has_table_privilege('authenticated', 'public.assistant_message_budget', 'select')
    and not has_table_privilege('service_role', 'public.assistant_message_budget', 'select'),
  'the budget counters stay unreadable to every client role'
);

-- The cap has one owner now. A client that could call it directly would learn nothing
-- dangerous, but the point is that only the two definer functions consult it.
select ok(
  not has_function_privilege('anon', 'public.assistant_daily_message_limit()', 'execute')
    and not has_function_privilege(
      'authenticated', 'public.assistant_daily_message_limit()', 'execute'
    )
    and not has_function_privilege(
      'service_role', 'public.assistant_daily_message_limit()', 'execute'
    ),
  'the daily cap is not readable by any client role'
);

select is(
  public.assistant_daily_message_limit(),
  20,
  'the daily cap is twenty messages'
);

-- Behaviour. A fresh creator, then one who has spent part of the day, then one who has
-- pushed past the cap.

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c3000000-0000-4000-8000-000000000001', true);

select is(
  (select used from public.assistant_message_usage()),
  0,
  'a creator who has sent nothing today has spent none of their allowance'
);

select is(
  (select daily_limit from public.assistant_message_usage()),
  20,
  'the reported limit is the one enforcement uses'
);

-- The reset is the next Manila midnight, which is always ahead of now and never more
-- than a day away. Asserting the boundary rather than a literal keeps the test correct
-- whatever hour it runs at.
select ok(
  (select resets_at from public.assistant_message_usage()) > now()
    and (select resets_at from public.assistant_message_usage())
      <= now() + make_interval(days => 1),
  'the allowance resets at the next Manila midnight'
);

select is(
  (select (resets_at at time zone 'Asia/Manila')::time from public.assistant_message_usage()),
  '00:00:00'::time,
  'the reset lands exactly on midnight in Manila, not on a rolling 24 hours'
);

select is(
  public.consume_assistant_message(),
  'allowed',
  'the first message of the day is allowed'
);

select is(
  (select used from public.assistant_message_usage()),
  1,
  'spending one message is reported as one used'
);

/*
  Past the cap, the stored counter keeps climbing — `consume_assistant_message`
  increments before it compares, so every refused attempt still writes. The reader
  clamps, because "24 of 20 used" is a number no creator can act on.
*/
set local role postgres;

update public.assistant_message_budget
set message_count = 24
where bucket_key = 'creator:c3000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c3000000-0000-4000-8000-000000000001', true);

select is(
  (select used from public.assistant_message_usage()),
  20,
  'a creator who kept pressing send past the cap is shown the cap, not the raw count'
);

select * from finish();
rollback;
