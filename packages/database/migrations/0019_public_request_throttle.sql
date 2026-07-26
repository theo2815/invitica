begin;

-- The three `/api/public/*` guest endpoints answer unauthenticated callers through
-- the service-role client, so RLS cannot bound how often one caller reaches them.
-- A guest link is meant to be forwarded, which makes volumetric abuse the realistic
-- failure rather than a stolen credential.
--
-- `bucket_key` is `{scope}:{hmac}` and never holds an address, only a keyed hash the
-- application computes, so this table stores no guest-identifying data.
create table public.public_request_throttle (
  bucket_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 1,
  constraint public_request_throttle_pkey
    primary key (bucket_key, window_start),
  constraint public_request_throttle_key_shape
    check (bucket_key ~ '^[a-z-]{1,32}:[0-9a-f]{64}$'),
  constraint public_request_throttle_count_positive
    check (request_count >= 1)
);

create index public_request_throttle_window_idx
on public.public_request_throttle (window_start);

alter table public.public_request_throttle enable row level security;

-- No client role reads or writes this table; only the security-definer function below
-- touches it, and it is never surfaced to a creator or a guest.
revoke all on table public.public_request_throttle
from public, anon, authenticated, service_role;

-- Returns true when the caller is still within budget and false once it is exhausted.
-- A malformed key is rejected rather than allowed, because only our own server builds
-- one.
create function public.consume_public_request(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  updated_count integer;
begin
  if p_bucket_key is null
    or p_bucket_key !~ '^[a-z-]{1,32}:[0-9a-f]{64}$'
    or p_limit is null
    or p_limit < 1
    or p_window_seconds is null
    or p_window_seconds < 1
    or p_window_seconds > 3600
  then
    return false;
  end if;

  -- Quantize to the window so a key holds one row per window rather than one per
  -- request, which is what keeps this table small under load.
  current_window := pg_catalog.date_bin(
    pg_catalog.make_interval(secs => p_window_seconds),
    pg_catalog.now(),
    pg_catalog.to_timestamp(0)
  );

  insert into public.public_request_throttle (bucket_key, window_start, request_count)
  values (p_bucket_key, current_window, 1)
  on conflict (bucket_key, window_start)
  do update set request_count = public_request_throttle.request_count + 1
  returning request_count into updated_count;

  -- Expired windows are dead weight and nothing reads them. Sweeping on a small
  -- fraction of calls keeps the table bounded without a scheduled job.
  if pg_catalog.random() < 0.01 then
    delete from public.public_request_throttle
    where window_start < pg_catalog.now() - pg_catalog.make_interval(secs => 3600);
  end if;

  return updated_count <= p_limit;
end;
$$;

revoke all on function public.consume_public_request(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_public_request(text, integer, integer)
to service_role;

commit;
