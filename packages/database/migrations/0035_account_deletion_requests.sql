begin;

/*
  Deleting an Invitica account takes two deliberate acts by the creator: a confirmation in the
  app, and a link in the email that follows it. This table is what holds the second one open
  between them.

  It stores a **hash** of the token, never the token. The raw value exists in the emailed link
  and nowhere else, so a read of this table yields nothing that can be replayed.

  The hash is a plain SHA-256 rather than the keyed hash `0012` uses for guest links, and the
  difference is deliberate. A keyed hash defends against precomputation over a guessable input
  space; this token is 32 bytes of CSPRNG output, where no such space exists. Keying it would add
  a server-only secret, its rotation story, and one more founder action, and defend nothing that
  the entropy does not already. Revisit if the token ever becomes shorter or derived.

  One row per creator. Asking again replaces the previous request, which invalidates the link
  already sent — the safe direction, since the most likely reason to ask twice is that the first
  email went somewhere the creator no longer trusts.

  No client role can read, insert, update, or delete here. Both functions below are security
  definer and derive the account from `auth.uid()`, so a creator can only ever act on their own
  request, and the token alone is never sufficient — the caller must also hold a live session for
  that account. That pairing is the point: an unguessable URL is not an authorization decision.

  The row is removed by the cascade when `auth.users` goes, which is the same statement that
  completes the deletion.
*/

create table public.account_deletion_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_hash bytea not null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  constraint account_deletion_requests_hash_length
    check (octet_length(token_hash) = 32),
  constraint account_deletion_requests_expires_after_request
    check (expires_at > requested_at)
);

-- The confirm route looks a request up by its token, never by the account, so that a wrong or
-- stale token cannot be distinguished from another creator's by timing the query.
create index account_deletion_requests_token_idx
on public.account_deletion_requests (token_hash);

alter table public.account_deletion_requests enable row level security;

revoke all on table public.account_deletion_requests from public, anon, authenticated, service_role;

/*
  Opens a request, replacing any existing one for this account.

  Returns nothing. The caller already holds the raw token — it generated it — and giving back
  anything derived from the row would only widen what a compromised session can learn.
*/
create function public.request_account_deletion(
  p_token_hash bytea,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    raise exception 'Invalid deletion token' using errcode = '22023';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Invalid deletion expiry' using errcode = '22023';
  end if;

  insert into public.account_deletion_requests (user_id, token_hash, expires_at)
  values (current_user_id, p_token_hash, p_expires_at)
  on conflict (user_id) do update
    set token_hash = excluded.token_hash,
        requested_at = now(),
        expires_at = excluded.expires_at,
        confirmed_at = null;
end;
$$;

revoke all on function public.request_account_deletion(bytea, timestamptz)
from public, anon, service_role;
grant execute on function public.request_account_deletion(bytea, timestamptz)
to authenticated;

/*
  Reports what the caller's own request is, for the token they present.

  `unknown` covers a token that never existed, one that belongs to another account, and one whose
  request was replaced — all three are the same answer to the person holding this link, and
  separating them would tell an attacker which of their guesses was closest.

  `p_claim` is what makes the confirmation single-use. Reading the page passes false; pressing the
  final button passes true, and the update either claims the row or reports that someone already
  did. Claiming is a single statement, so two simultaneous clicks cannot both win it — which
  matters, because the caller purges published invitations from R2 next and that is not work to
  run twice.
*/
create function public.resolve_account_deletion(
  p_token_hash bytea,
  p_claim boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected record;
  claimed_rows integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    return 'unknown';
  end if;

  select confirmed_at, expires_at
  into selected
  from public.account_deletion_requests
  where user_id = current_user_id
    and token_hash = p_token_hash;

  if not found then
    return 'unknown';
  end if;

  if selected.confirmed_at is not null then
    return 'used';
  end if;

  if selected.expires_at <= now() then
    return 'expired';
  end if;

  if not p_claim then
    return 'valid';
  end if;

  update public.account_deletion_requests
  set confirmed_at = now()
  where user_id = current_user_id
    and token_hash = p_token_hash
    and confirmed_at is null
    and expires_at > now();

  get diagnostics claimed_rows = row_count;

  if claimed_rows = 0 then
    return 'used';
  end if;

  return 'claimed';
end;
$$;

revoke all on function public.resolve_account_deletion(bytea, boolean)
from public, anon, service_role;
grant execute on function public.resolve_account_deletion(bytea, boolean)
to authenticated;

commit;
