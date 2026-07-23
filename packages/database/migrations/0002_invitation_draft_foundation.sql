begin;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  occasion text not null,
  event_timezone text not null default 'Asia/Manila',
  locale text not null default 'en-PH',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_workspace_id_id_unique unique (workspace_id, id),
  constraint events_name_not_blank check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint events_occasion_supported check (
    occasion in ('wedding', 'birthday', 'christening', 'baby_shower', 'debut', 'anniversary')
  ),
  constraint events_timezone_not_blank check (
    char_length(btrim(event_timezone)) between 1 and 100
  ),
  constraint events_locale_supported check (locale in ('en-PH', 'fil-PH')),
  constraint events_time_order check (
    ends_at is null or starts_at is null or ends_at >= starts_at
  )
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  event_id uuid not null,
  template_version_id uuid not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_workspace_event_fk
    foreign key (workspace_id, event_id)
    references public.events (workspace_id, id)
    on delete cascade,
  constraint invitations_workspace_id_template_unique
    unique (workspace_id, id, template_version_id),
  constraint invitations_status_draft check (status = 'draft')
);

create table public.invitation_drafts (
  invitation_id uuid primary key,
  workspace_id uuid not null,
  template_version_id uuid not null,
  revision bigint not null default 1,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitation_drafts_invitation_template_fk
    foreign key (workspace_id, invitation_id, template_version_id)
    references public.invitations (workspace_id, id, template_version_id)
    on delete cascade,
  constraint invitation_drafts_revision_positive check (revision >= 1),
  constraint invitation_drafts_document_object check (jsonb_typeof(document) = 'object'),
  constraint invitation_drafts_schema_version_v1 check (
    coalesce(document ->> 'schemaVersion' = '1', false)
  ),
  constraint invitation_drafts_template_version_matches check (
    coalesce(document ->> 'templateVersionId' = template_version_id::text, false)
  )
);

create index invitations_event_id_idx on public.invitations (event_id);
create index invitation_drafts_workspace_id_idx on public.invitation_drafts (workspace_id);

create or replace function public.set_record_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.enforce_invitation_draft_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.revision <> 1 then
    raise exception 'An invitation draft must start at revision 1' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.revision <> old.revision + 1 then
    raise exception 'An invitation draft revision must increase by exactly 1' using errcode = '23514';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_record_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_invitation_draft_revision() from public, anon, authenticated;

create trigger events_set_updated_at
before update on public.events
for each row
execute function public.set_record_updated_at();

create trigger invitation_drafts_enforce_revision
before insert or update on public.invitation_drafts
for each row
execute function public.enforce_invitation_draft_revision();

alter table public.events enable row level security;
alter table public.invitations enable row level security;
alter table public.invitation_drafts enable row level security;

revoke all on table public.events from public, anon, authenticated;
revoke all on table public.invitations from public, anon, authenticated;
revoke all on table public.invitation_drafts from public, anon, authenticated;

grant select, insert on table public.events to authenticated;
grant update (name, occasion, event_timezone, locale, starts_at, ends_at)
on table public.events to authenticated;

grant select, insert on table public.invitations to authenticated;

grant select, insert on table public.invitation_drafts to authenticated;
grant update (document, revision) on table public.invitation_drafts to authenticated;

create policy events_select_active_owner
on public.events
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = events.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy events_insert_active_owner
on public.events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = events.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy events_update_active_owner
on public.events
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = events.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
)
with check (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = events.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy invitations_select_active_owner
on public.invitations
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = invitations.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy invitations_insert_active_owner
on public.invitations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = invitations.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy invitation_drafts_select_active_owner
on public.invitation_drafts
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = invitation_drafts.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy invitation_drafts_insert_active_owner
on public.invitation_drafts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = invitation_drafts.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy invitation_drafts_update_active_owner
on public.invitation_drafts
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = invitation_drafts.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
)
with check (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = invitation_drafts.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

commit;
