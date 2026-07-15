begin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  personal_owner_user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null default 'Personal workspace',
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  status text not null default 'active' check (status = 'active'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.workspaces from public, anon, authenticated;
revoke all on table public.workspace_members from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

grant select on table public.workspaces to authenticated;
grant update (name) on table public.workspaces to authenticated;

grant select on table public.workspace_members to authenticated;

create policy profiles_select_self
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_self
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy workspace_members_select_self
on public.workspace_members
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy workspaces_select_active_owner
on public.workspaces
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = workspaces.id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy workspaces_update_active_owner
on public.workspaces
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = workspaces.id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
)
with check (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = workspaces.id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create or replace function public.ensure_personal_workspace()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  personal_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  insert into public.workspaces (personal_owner_user_id)
  values (current_user_id)
  on conflict (personal_owner_user_id) do update
    set personal_owner_user_id = excluded.personal_owner_user_id
  returning id into personal_workspace_id;

  insert into public.workspace_members (workspace_id, user_id)
  values (personal_workspace_id, current_user_id)
  on conflict (workspace_id, user_id) do nothing;

  return personal_workspace_id;
end;
$$;

revoke all on function public.ensure_personal_workspace() from public, anon;
grant execute on function public.ensure_personal_workspace() to authenticated;

commit;
