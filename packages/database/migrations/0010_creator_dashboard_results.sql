begin;

create table public.invitation_view_daily (
  workspace_id uuid not null,
  invitation_id uuid not null,
  viewed_on date not null,
  view_count bigint not null default 1,
  last_viewed_at timestamptz not null default now(),
  constraint invitation_view_daily_pkey
    primary key (workspace_id, invitation_id, viewed_on),
  constraint invitation_view_daily_invitation_fk
    foreign key (workspace_id, invitation_id)
    references public.invitations (workspace_id, id)
    on delete cascade,
  constraint invitation_view_daily_count_positive check (view_count >= 1)
);

create index invitation_view_daily_workspace_invitation_idx
on public.invitation_view_daily (workspace_id, invitation_id, viewed_on desc);

alter table public.invitation_view_daily enable row level security;

revoke all on table public.invitation_view_daily from public, anon, authenticated, service_role;
grant select on table public.invitation_view_daily to authenticated;

create policy invitation_view_daily_select_active_owner
on public.invitation_view_daily
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = invitation_view_daily.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create function public.record_invitation_view(p_public_identifier text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_alias record;
begin
  if p_public_identifier is null
    or p_public_identifier !~ '^[0-9a-f]{32}$'
  then
    return false;
  end if;

  select
    publication_aliases.workspace_id,
    publication_aliases.invitation_id
  into selected_alias
  from public.publication_aliases
  where publication_aliases.public_identifier = p_public_identifier
    and publication_aliases.delivery_status = 'delivered'
    and publication_aliases.delivered_publication_id is not null
  limit 1;

  if not found then
    return false;
  end if;

  insert into public.invitation_view_daily (
    workspace_id,
    invitation_id,
    viewed_on,
    view_count,
    last_viewed_at
  )
  values (
    selected_alias.workspace_id,
    selected_alias.invitation_id,
    (pg_catalog.now() at time zone 'UTC')::date,
    1,
    pg_catalog.now()
  )
  on conflict (workspace_id, invitation_id, viewed_on)
  do update set
    view_count = invitation_view_daily.view_count + 1,
    last_viewed_at = excluded.last_viewed_at;

  return true;
end;
$$;

revoke all on function public.record_invitation_view(text)
from public, anon, authenticated;
grant execute on function public.record_invitation_view(text)
to service_role;

commit;
