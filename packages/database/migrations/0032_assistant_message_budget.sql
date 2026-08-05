begin;

/*
  Server-enforced spending limits for the creator AI assistant.

  ADR-008 bounds assistant cost by enforcement rather than by monitoring, and
  forbids the service-role key on this path. `0019`'s `consume_public_request`
  cannot be reused: it is granted to `service_role` alone and revoked from
  `authenticated`, because the guest endpoints it serves run behind the
  service-role client. Widening that grant would hand every signed-in creator a
  direct PostgREST call into the guest throttle. This is a separate function on
  the same bucket pattern instead.

  The limits are constants in the function body, not parameters. `0019` could
  accept a limit from its caller because only our own server could reach it; an
  `authenticated` role can call this one directly through PostgREST, so a
  caller-supplied limit would be a caller-supplied budget. Changing a cap is a
  migration, which matches how `0028` already gives the database ownership of
  policy the application must not set for itself.

  Windows are quantized rather than sliding, as in `0019`: one row per creator
  per day instead of one per message. The daily window is aligned to Asia/Manila
  midnight rather than UTC, so a Philippine creator's allowance resets overnight
  where they are and not at 08:00 in their morning. The known trade-off is that a
  creator may spend the tail of one day and the head of the next in quick
  succession — bounded at 2x the daily cap over a few minutes, and bounded
  absolutely by the monthly ceiling below.
*/

create table public.assistant_message_budget (
  bucket_key text not null,
  window_start timestamptz not null,
  message_count integer not null default 1,
  constraint assistant_message_budget_pkey
    primary key (bucket_key, window_start),
  constraint assistant_message_budget_key_shape
    check (
      bucket_key = 'global'
      or bucket_key ~ '^creator:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
  constraint assistant_message_budget_count_positive
    check (message_count >= 1)
);

create index assistant_message_budget_window_idx
on public.assistant_message_budget (window_start);

alter table public.assistant_message_budget enable row level security;

-- Only the security-definer function below touches these counters. A creator is
-- told how much budget remains by the function's return value; the table itself
-- is never surfaced.
revoke all on table public.assistant_message_budget
from public, anon, authenticated, service_role;

/*
  Consumes one assistant message for the calling creator and reports the outcome.

  Returns `allowed`, `creator_daily_limit`, `global_monthly_limit`, or
  `unauthenticated`. It names which ceiling was reached rather than returning a
  bare boolean, because the two reset on different schedules: a creator over
  their own allowance may try again tomorrow, while the monthly ceiling holds
  until the month turns. One message covering both would be wrong in one case.

  Fails closed. `0019` fails open because a guest losing their RSVP to an
  infrastructure fault is worse than an unthrottled request. The opposite holds
  here: an unbounded metered third-party bill against an unmeasured PHP
  5,000/month infrastructure ceiling is worse than a creator being told the
  assistant is unavailable. Any error, and any unauthenticated caller, refuses.

  The daily allowance is consumed before the monthly ceiling is checked, so a
  creator whose request is refused by the global ceiling has still spent one of
  their own twenty. That is a deliberate simplification: when the global ceiling
  is reached the assistant is unavailable to everyone regardless, and the per-
  creator cap is what stops the wasted increments from being unbounded.
*/
create function public.consume_assistant_message()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Twenty help turns a day is well past a creator working through their own
  -- invitation and short of a session that could run a bill up unattended.
  daily_limit constant integer := 20;
  -- 3,000 messages is roughly PHP 570/month at the planning estimate of ~PHP
  -- 0.19 per help turn on `claude-haiku-4-5`, about a ninth of the accepted
  -- infrastructure ceiling, and 150 creator-days at the full daily cap — ample
  -- for a closed beta. Revisit this in the document-proposing stage: one
  -- document turn is estimated at 3x to 14x a help turn, so a message count
  -- stops being a usable proxy for cost once both workloads share this ceiling.
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

revoke all on function public.consume_assistant_message()
from public, anon, service_role;
grant execute on function public.consume_assistant_message()
to authenticated;

commit;
