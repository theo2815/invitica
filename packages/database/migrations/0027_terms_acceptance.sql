create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version text not null
    check (terms_version ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  privacy_notice_version text not null
    check (privacy_notice_version ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  accepted_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_notice_version)
);

alter table public.terms_acceptances enable row level security;

revoke all on table public.terms_acceptances from anon, authenticated, service_role;
grant select on table public.terms_acceptances to authenticated;
grant insert (user_id, terms_version, privacy_notice_version)
  on table public.terms_acceptances to authenticated;

create policy terms_acceptances_select_own
on public.terms_acceptances
for select
to authenticated
using (user_id = auth.uid());

create policy terms_acceptances_insert_own
on public.terms_acceptances
for insert
to authenticated
with check (user_id = auth.uid());
