begin;

create table public.guest_parties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invitation_id uuid not null,
  internal_label text not null,
  recipient_name text not null,
  capacity integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_parties_invitation_fk
    foreign key (workspace_id, invitation_id)
    references public.invitations (workspace_id, id)
    on delete cascade,
  constraint guest_parties_workspace_invitation_id_unique
    unique (workspace_id, invitation_id, id),
  constraint guest_parties_internal_label_bounded check (
    char_length(btrim(internal_label)) between 1 and 120
  ),
  constraint guest_parties_recipient_name_bounded check (
    char_length(btrim(recipient_name)) between 1 and 120
  ),
  constraint guest_parties_capacity_bounded check (capacity between 1 and 50)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invitation_id uuid not null,
  guest_party_id uuid not null,
  name text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint guests_party_fk
    foreign key (workspace_id, invitation_id, guest_party_id)
    references public.guest_parties (workspace_id, invitation_id, id)
    on delete cascade,
  constraint guests_name_bounded check (char_length(btrim(name)) between 1 and 120),
  constraint guests_sort_order_positive check (sort_order >= 1),
  constraint guests_party_sort_order_unique unique (guest_party_id, sort_order)
);

create table public.guest_party_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invitation_id uuid not null,
  guest_party_id uuid not null,
  token_hash text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint guest_party_links_party_fk
    foreign key (workspace_id, invitation_id, guest_party_id)
    references public.guest_parties (workspace_id, invitation_id, id)
    on delete cascade,
  constraint guest_party_links_token_hash_unique unique (token_hash),
  constraint guest_party_links_token_hash_shape check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint guest_party_links_status_supported check (status in ('active', 'revoked')),
  constraint guest_party_links_status_consistent check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create unique index guest_party_links_one_active_per_party_idx
on public.guest_party_links (guest_party_id)
where status = 'active';

create index guest_parties_workspace_invitation_idx
on public.guest_parties (workspace_id, invitation_id, created_at, id);

create index guests_workspace_party_idx
on public.guests (workspace_id, guest_party_id, sort_order);

create trigger guest_parties_set_updated_at
before update on public.guest_parties
for each row execute function public.set_record_updated_at();

alter table public.guest_parties enable row level security;
alter table public.guests enable row level security;
alter table public.guest_party_links enable row level security;

revoke all on table public.guest_parties from public, anon, authenticated, service_role;
revoke all on table public.guests from public, anon, authenticated, service_role;
revoke all on table public.guest_party_links from public, anon, authenticated, service_role;

grant select on table public.guest_parties to authenticated;
grant select on table public.guests to authenticated;
grant select (
  id,
  workspace_id,
  invitation_id,
  guest_party_id,
  status,
  created_at,
  revoked_at
) on table public.guest_party_links to authenticated;

create policy guest_parties_select_active_owner
on public.guest_parties
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = guest_parties.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy guests_select_active_owner
on public.guests
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = guests.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy guest_party_links_select_active_owner
on public.guest_party_links
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = guest_party_links.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create function public.create_guest_party(
  p_party_id uuid,
  p_link_id uuid,
  p_invitation_id uuid,
  p_internal_label text,
  p_recipient_name text,
  p_capacity integer,
  p_guest_names text[],
  p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_workspace_id uuid;
begin
  p_internal_label := btrim(p_internal_label);
  p_recipient_name := btrim(p_recipient_name);
  p_token_hash := lower(btrim(p_token_hash));
  p_guest_names := coalesce(p_guest_names, array[]::text[]);

  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_party_id is null
    or p_link_id is null
    or p_invitation_id is null
    or p_internal_label is null
    or char_length(p_internal_label) not between 1 and 120
    or p_recipient_name is null
    or char_length(p_recipient_name) not between 1 and 120
    or p_capacity is null
    or p_capacity not between 1 and 50
    or cardinality(p_guest_names) > p_capacity
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or exists (
      select 1
      from unnest(p_guest_names) as guest_name
      where guest_name is null
        or char_length(btrim(guest_name)) not between 1 and 120
    ) then
    raise exception 'Invalid guest party' using errcode = '22023';
  end if;

  select invitations.workspace_id
  into selected_workspace_id
  from public.invitations
  inner join public.workspace_members
    on workspace_members.workspace_id = invitations.workspace_id
  inner join public.publication_aliases
    on publication_aliases.workspace_id = invitations.workspace_id
    and publication_aliases.invitation_id = invitations.id
  where invitations.id = p_invitation_id
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
    and publication_aliases.delivery_status = 'delivered'
    and publication_aliases.delivered_publication_id is not null;

  if not found then
    raise exception 'Delivered invitation not found' using errcode = 'P0002';
  end if;

  insert into public.guest_parties (
    id,
    workspace_id,
    invitation_id,
    internal_label,
    recipient_name,
    capacity
  )
  values (
    p_party_id,
    selected_workspace_id,
    p_invitation_id,
    p_internal_label,
    p_recipient_name,
    p_capacity
  );

  insert into public.guests (
    workspace_id,
    invitation_id,
    guest_party_id,
    name,
    sort_order
  )
  select
    selected_workspace_id,
    p_invitation_id,
    p_party_id,
    btrim(guest_name),
    ordinal::integer
  from unnest(p_guest_names) with ordinality as names(guest_name, ordinal);

  insert into public.guest_party_links (
    id,
    workspace_id,
    invitation_id,
    guest_party_id,
    token_hash
  )
  values (
    p_link_id,
    selected_workspace_id,
    p_invitation_id,
    p_party_id,
    p_token_hash
  );

  return p_party_id;
end;
$$;

create function public.replace_guest_party_link(
  p_guest_party_id uuid,
  p_link_id uuid,
  p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_party record;
begin
  p_token_hash := lower(btrim(p_token_hash));

  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_guest_party_id is null
    or p_link_id is null
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid guest link replacement' using errcode = '22023';
  end if;

  select
    guest_parties.workspace_id,
    guest_parties.invitation_id
  into selected_party
  from public.guest_parties
  inner join public.workspace_members
    on workspace_members.workspace_id = guest_parties.workspace_id
  inner join public.publication_aliases
    on publication_aliases.workspace_id = guest_parties.workspace_id
    and publication_aliases.invitation_id = guest_parties.invitation_id
  where guest_parties.id = p_guest_party_id
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
    and publication_aliases.delivery_status = 'delivered'
    and publication_aliases.delivered_publication_id is not null
  for update of guest_parties;

  if not found then
    raise exception 'Guest party not found' using errcode = 'P0002';
  end if;

  update public.guest_party_links
  set status = 'revoked', revoked_at = now()
  where guest_party_id = p_guest_party_id
    and status = 'active';

  insert into public.guest_party_links (
    id,
    workspace_id,
    invitation_id,
    guest_party_id,
    token_hash
  )
  values (
    p_link_id,
    selected_party.workspace_id,
    selected_party.invitation_id,
    p_guest_party_id,
    p_token_hash
  );

  return p_link_id;
end;
$$;

create function public.revoke_guest_party_link(p_guest_party_id uuid)
returns boolean
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

  if p_guest_party_id is null then
    raise exception 'Invalid guest link revocation' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.guest_parties
    inner join public.workspace_members
      on workspace_members.workspace_id = guest_parties.workspace_id
    where guest_parties.id = p_guest_party_id
      and workspace_members.user_id = current_user_id
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  ) then
    raise exception 'Guest party not found' using errcode = 'P0002';
  end if;

  update public.guest_party_links
  set status = 'revoked', revoked_at = now()
  where guest_party_id = p_guest_party_id
    and status = 'active';

  return found;
end;
$$;

create function public.resolve_guest_party_link(
  p_public_identifier text,
  p_token_hash text
)
returns table (recipient_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select guest_parties.recipient_name
  from public.guest_party_links
  inner join public.guest_parties
    on guest_parties.workspace_id = guest_party_links.workspace_id
    and guest_parties.invitation_id = guest_party_links.invitation_id
    and guest_parties.id = guest_party_links.guest_party_id
  inner join public.publication_aliases
    on publication_aliases.workspace_id = guest_party_links.workspace_id
    and publication_aliases.invitation_id = guest_party_links.invitation_id
  where guest_party_links.token_hash = lower(btrim(p_token_hash))
    and guest_party_links.status = 'active'
    and publication_aliases.public_identifier = lower(btrim(p_public_identifier))
    and publication_aliases.delivery_status = 'delivered'
    and publication_aliases.delivered_publication_id is not null
    and p_public_identifier ~ '^[0-9a-f]{32}$'
    and p_token_hash ~ '^[0-9a-fA-F]{64}$'
  limit 1
$$;

revoke all on function public.create_guest_party(uuid, uuid, uuid, text, text, integer, text[], text)
from public, anon, service_role;
grant execute on function public.create_guest_party(uuid, uuid, uuid, text, text, integer, text[], text)
to authenticated;

revoke all on function public.replace_guest_party_link(uuid, uuid, text)
from public, anon, service_role;
grant execute on function public.replace_guest_party_link(uuid, uuid, text)
to authenticated;

revoke all on function public.revoke_guest_party_link(uuid)
from public, anon, service_role;
grant execute on function public.revoke_guest_party_link(uuid)
to authenticated;

revoke all on function public.resolve_guest_party_link(text, text)
from public, anon, authenticated;
grant execute on function public.resolve_guest_party_link(text, text)
to service_role;

commit;
