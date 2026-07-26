begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(12);

-- Privilege surface. Only the service-role client behind `/api/public/*` may consume
-- budget, and no client role may read the counters.

select ok(
  has_function_privilege(
    'service_role',
    'public.consume_public_request(text,integer,integer)',
    'execute'
  ),
  'the service-role client backing the public guest endpoints may consume budget'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.consume_public_request(text,integer,integer)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.consume_public_request(text,integer,integer)',
      'execute'
    ),
  'guests and creators cannot call the throttle directly'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.consume_public_request(text,integer,integer)'::regprocedure
  ),
  true,
  'the throttle runs through a security-definer boundary'
);

select ok(
  not has_table_privilege('anon', 'public.public_request_throttle', 'select')
    and not has_table_privilege('authenticated', 'public.public_request_throttle', 'select')
    and not has_table_privilege('service_role', 'public.public_request_throttle', 'select'),
  'no client role can read the throttle counters'
);

-- Behaviour. `0013` and `0014` both installed cleanly and failed on their first real
-- call because their suites only inspected the catalog, so every assertion below
-- invokes the function.

select is(
  public.consume_public_request('rsvp:' || repeat('a', 64), 3, 60),
  true,
  'the first request in a window is within budget'
);

select is(
  (
    select bool_and(public.consume_public_request('rsvp:' || repeat('a', 64), 3, 60))
    from generate_series(1, 2)
  ),
  true,
  'requests up to the limit stay within budget'
);

select is(
  public.consume_public_request('rsvp:' || repeat('a', 64), 3, 60),
  false,
  'the request past the limit is refused'
);

select is(
  public.consume_public_request('view:' || repeat('a', 64), 3, 60),
  true,
  'a different scope over the same caller keeps its own budget'
);

select is(
  public.consume_public_request('rsvp:' || repeat('b', 64), 3, 60),
  true,
  'a different caller in the same scope keeps its own budget'
);

select is(
  (
    select request_count
    from public.public_request_throttle
    where bucket_key = 'rsvp:' || repeat('a', 64)
  ),
  4,
  'one exhausted caller holds exactly one row per window, not one per request'
);

-- Malformed input is refused rather than allowed. Only our own server builds a key,
-- so a key that does not parse means something is wrong upstream.

select is(
  public.consume_public_request('rsvp:not-a-digest', 3, 60),
  false,
  'a bucket key that is not a keyed hash is refused'
);

select is(
  (
    select bool_or(result)
    from (
      values
        (public.consume_public_request(null, 3, 60)),
        (public.consume_public_request('rsvp:' || repeat('c', 64), 0, 60)),
        (public.consume_public_request('rsvp:' || repeat('c', 64), 3, 0)),
        (public.consume_public_request('rsvp:' || repeat('c', 64), 3, 7200))
    ) as refused (result)
  ),
  false,
  'a missing key, a nonpositive limit, and an out-of-range window are all refused'
);

select * from finish();

rollback;
