begin;

/*
  Lets a creator read how much of today's Tala allowance they have spent.

  `0032` deliberately closed every path to these counters: the table is revoked from
  every client role, and `consume_assistant_message` returns which ceiling was hit
  and nothing else. That was right while the only question was "may this message go
  through". It stops being enough the moment the creator is shown a number, because
  there is no way to derive one — the browser cannot count reliably across a reload,
  a second device, or the Manila midnight rollover, and the route handler never
  learns the count either.

  So this is a second, read-only door onto the same rows. It reads one bucket — the
  calling creator's own day — and nothing else. The global monthly bucket stays
  unreadable by anyone: how close Invitica is to its own ceiling is not a creator's
  business, and publishing it would tell every creator when to expect the assistant
  to stop working.

  No counter is written here. Spending stays in `consume_assistant_message`, so this
  function cannot cost a creator a message by being called, and the page may read it
  on every render without consequence.
*/

/*
  The daily cap, in one place.

  `0032` held it as a constant inside `consume_assistant_message`. A second copy in
  the reader below would be a meter that quietly disagrees with enforcement the first
  time the cap moves — the exact failure a creator would notice and never be able to
  explain. Both functions now ask this one.

  Not granted to any client role. Both callers are security definer and run as the
  owner, which has execute implicitly, so nothing outside this file can read the
  policy directly.
*/
create function public.assistant_daily_message_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  -- Twenty help turns a day is well past a creator working through their own
  -- invitation and short of a session that could run a bill up unattended. Moved
  -- here from `0032` unchanged.
  select 20;
$$;

revoke all on function public.assistant_daily_message_limit()
from public, anon, authenticated, service_role;

/*
  Rewritten only to read the cap from the function above. Every other line, and the
  order in which the daily allowance is spent before the monthly ceiling is checked,
  is `0032`'s and is unchanged. `create or replace` keeps the existing grants.
*/
create or replace function public.consume_assistant_message()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_limit constant integer := public.assistant_daily_message_limit();
  -- 3,000 messages is roughly PHP 570/month at the planning estimate of ~PHP
  -- 0.19 per help turn on `claude-haiku-4-5`, about a ninth of the accepted
  -- infrastructure ceiling, and 150 creator-days at the full daily cap — ample
  -- for a closed beta.
  monthly_limit constant integer := 3000;
  current_user_id uuid := auth.uid();
  day_start timestamptz;
  month_start timestamptz;
  daily_count integer;
  monthly_count integer;
begin
  if current_user_id is null then
    return 'unauthenticated';
  end if;

  day_start := pg_catalog.date_trunc(
    'day',
    pg_catalog.now() at time zone 'Asia/Manila'
  ) at time zone 'Asia/Manila';

  month_start := pg_catalog.date_trunc(
    'month',
    pg_catalog.now() at time zone 'Asia/Manila'
  ) at time zone 'Asia/Manila';

  insert into public.assistant_message_budget (bucket_key, window_start, message_count)
  values ('creator:' || current_user_id::text, day_start, 1)
  on conflict (bucket_key, window_start)
  do update set message_count = assistant_message_budget.message_count + 1
  returning message_count into daily_count;

  if daily_count > daily_limit then
    return 'creator_daily_limit';
  end if;

  insert into public.assistant_message_budget (bucket_key, window_start, message_count)
  values ('global', month_start, 1)
  on conflict (bucket_key, window_start)
  do update set message_count = assistant_message_budget.message_count + 1
  returning message_count into monthly_count;

  if monthly_count > monthly_limit then
    return 'global_monthly_limit';
  end if;

  -- Expired windows are dead weight and nothing reads them. Sweeping on a small
  -- fraction of calls keeps the table bounded without a scheduled job. Sixty
  -- days retains the current and previous monthly rows.
  if pg_catalog.random() < 0.01 then
    delete from public.assistant_message_budget
    where window_start < pg_catalog.now() - pg_catalog.make_interval(days => 60);
  end if;

  return 'allowed';
end;
$$;

/*
  Today's spend for the calling creator, and when it starts again.

  `used` is clamped to the cap on purpose. `consume_assistant_message` increments
  before it compares, so a creator who keeps pressing send after their twentieth
  message drives the stored count to 21, 22, 23 — each of those requests is refused
  and none of them is billed, but the raw number would put "24 of 20 used" on the
  screen. The clamp is display truth; the row keeps the real count.

  `resets_at` is the next Manila midnight, computed in local time and converted
  back, so it stays correct if the country ever adopts an offset change. It is
  returned as an instant rather than as words, because only the browser knows which
  clock the creator reads.
*/
create function public.assistant_message_usage()
returns table (used integer, daily_limit integer, resets_at timestamptz)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  -- Manila wall-clock midnight, the same value `consume_assistant_message` keys its
  -- daily bucket on. Held without a zone so the next one can be found by adding a
  -- local day rather than 24 hours.
  local_day timestamp;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  local_day := pg_catalog.date_trunc(
    'day',
    pg_catalog.now() at time zone 'Asia/Manila'
  );

  daily_limit := public.assistant_daily_message_limit();
  resets_at := (local_day + pg_catalog.make_interval(days => 1)) at time zone 'Asia/Manila';

  -- `least` and `coalesce` are grammar, not functions, so they cannot be qualified
  -- the way `date_trunc` is above. They resolve regardless: `pg_catalog` stays on
  -- the effective search path even when it is set to the empty string.
  select least(budget.message_count, daily_limit)
  into used
  from public.assistant_message_budget as budget
  where budget.bucket_key = 'creator:' || current_user_id::text
    and budget.window_start = local_day at time zone 'Asia/Manila';

  -- No row means no message today, which is a full allowance rather than an
  -- unknown one. The application's "could not read this" state is reserved for a
  -- call that actually failed.
  used := coalesce(used, 0);

  return next;
end;
$$;

revoke all on function public.assistant_message_usage()
from public, anon, service_role;
grant execute on function public.assistant_message_usage()
to authenticated;

commit;
