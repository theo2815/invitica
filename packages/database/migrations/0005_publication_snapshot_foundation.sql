begin;

alter table public.invitations
add constraint invitations_workspace_id_unique unique (workspace_id, id);

create table public.publication_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invitation_id uuid not null,
  publication_number bigint not null,
  idempotency_key uuid not null,
  snapshot_version integer not null,
  invitation_schema_version integer not null,
  renderer_key text not null,
  renderer_version integer not null,
  template_version_id uuid not null,
  template_version integer not null,
  draft_revision bigint not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint publication_versions_invitation_template_fk
    foreign key (workspace_id, invitation_id, template_version_id)
    references public.invitations (workspace_id, id, template_version_id)
    on delete cascade,
  constraint publication_versions_workspace_invitation_id_unique
    unique (workspace_id, invitation_id, id),
  constraint publication_versions_invitation_number_unique
    unique (invitation_id, publication_number),
  constraint publication_versions_workspace_idempotency_unique
    unique (workspace_id, idempotency_key),
  constraint publication_versions_number_positive check (publication_number >= 1),
  constraint publication_versions_snapshot_version_v1 check (snapshot_version = 1),
  constraint publication_versions_schema_version_v1 check (invitation_schema_version = 1),
  constraint publication_versions_renderer_key_not_blank check (
    char_length(btrim(renderer_key)) between 1 and 100
  ),
  constraint publication_versions_renderer_version_positive check (renderer_version >= 1),
  constraint publication_versions_template_version_positive check (template_version >= 1),
  constraint publication_versions_draft_revision_positive check (draft_revision >= 1),
  constraint publication_versions_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint publication_versions_snapshot_pins_match check (
    coalesce(snapshot ->> 'snapshotVersion' = snapshot_version::text, false)
    and coalesce(
      snapshot ->> 'invitationSchemaVersion' = invitation_schema_version::text,
      false
    )
    and coalesce(snapshot ->> 'rendererKey' = renderer_key, false)
    and coalesce(snapshot ->> 'rendererVersion' = renderer_version::text, false)
    and coalesce(snapshot ->> 'templateVersionId' = template_version_id::text, false)
    and coalesce(snapshot ->> 'templateVersion' = template_version::text, false)
    and coalesce(snapshot ->> 'draftRevision' = draft_revision::text, false)
    and coalesce(jsonb_typeof(snapshot -> 'document') = 'object', false)
    and coalesce(jsonb_typeof(snapshot -> 'assets') = 'array', false)
    and coalesce(
      snapshot #>> '{document,schemaVersion}' = invitation_schema_version::text,
      false
    )
    and coalesce(
      snapshot #>> '{document,templateVersionId}' = template_version_id::text,
      false
    )
  )
);

create table public.publication_builds (
  publication_id uuid primary key,
  workspace_id uuid not null,
  invitation_id uuid not null,
  status text not null default 'pending',
  artifact_key text,
  artifact_sha256 text,
  error_code text,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_builds_version_fk
    foreign key (workspace_id, invitation_id, publication_id)
    references public.publication_versions (workspace_id, invitation_id, id)
    on delete cascade,
  constraint publication_builds_status_supported check (
    status in ('pending', 'completed', 'failed')
  ),
  constraint publication_builds_state_consistent check (
    (
      status = 'pending'
      and artifact_key is null
      and artifact_sha256 is null
      and error_code is null
      and completed_at is null
      and failed_at is null
    )
    or (
      status = 'completed'
      and artifact_key is not null
      and artifact_sha256 is not null
      and error_code is null
      and completed_at is not null
      and failed_at is null
    )
    or (
      status = 'failed'
      and artifact_key is null
      and artifact_sha256 is null
      and error_code is not null
      and completed_at is null
      and failed_at is not null
    )
  )
);

create table public.publication_aliases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invitation_id uuid not null,
  public_identifier text not null default encode(gen_random_bytes(16), 'hex'),
  active_publication_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_aliases_invitation_unique unique (invitation_id),
  constraint publication_aliases_public_identifier_unique unique (public_identifier),
  constraint publication_aliases_invitation_fk
    foreign key (workspace_id, invitation_id)
    references public.invitations (workspace_id, id)
    on delete cascade,
  constraint publication_aliases_active_publication_fk
    foreign key (workspace_id, invitation_id, active_publication_id)
    references public.publication_versions (workspace_id, invitation_id, id),
  constraint publication_aliases_public_identifier_entropy check (
    public_identifier ~ '^[0-9a-f]{32}$'
  )
);

create index publication_versions_workspace_invitation_idx
on public.publication_versions (workspace_id, invitation_id, publication_number desc);

create index publication_builds_workspace_status_idx
on public.publication_builds (workspace_id, status);

create or replace function public.prevent_publication_version_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Publication versions are immutable' using errcode = '55000';
end;
$$;

revoke all on function public.prevent_publication_version_update()
from public, anon, authenticated, service_role;

create trigger publication_versions_prevent_update
before update on public.publication_versions
for each row
execute function public.prevent_publication_version_update();

create trigger publication_builds_set_updated_at
before update on public.publication_builds
for each row
execute function public.set_record_updated_at();

create trigger publication_aliases_set_updated_at
before update on public.publication_aliases
for each row
execute function public.set_record_updated_at();

alter table public.publication_versions enable row level security;
alter table public.publication_builds enable row level security;
alter table public.publication_aliases enable row level security;

revoke all on table public.publication_versions from public, anon, authenticated, service_role;
revoke all on table public.publication_builds from public, anon, authenticated, service_role;
revoke all on table public.publication_aliases from public, anon, authenticated, service_role;

grant select on table public.publication_versions to authenticated;
grant select on table public.publication_builds to authenticated;
grant select on table public.publication_aliases to authenticated;
grant select on table public.publication_versions to service_role;
grant select on table public.publication_builds to service_role;
grant select on table public.publication_aliases to service_role;

create policy publication_versions_select_active_owner
on public.publication_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = publication_versions.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy publication_builds_select_active_owner
on public.publication_builds
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = publication_builds.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create policy publication_aliases_select_active_owner
on public.publication_aliases
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = publication_aliases.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create or replace function public.request_invitation_publication(
  p_invitation_id uuid,
  p_expected_draft_revision bigint,
  p_idempotency_key uuid,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_workspace_id uuid;
  current_template_version_id uuid;
  current_draft_revision bigint;
  current_document jsonb;
  existing_publication record;
  next_publication_number bigint;
  created_publication_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_invitation_id is null
    or p_idempotency_key is null
    or p_expected_draft_revision is null
    or p_expected_draft_revision < 1
    or p_snapshot is null
    or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Invalid publication request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );

  select
    invitation_drafts.workspace_id,
    invitation_drafts.template_version_id,
    invitation_drafts.revision,
    invitation_drafts.document
  into
    current_workspace_id,
    current_template_version_id,
    current_draft_revision,
    current_document
  from public.invitation_drafts
  inner join public.workspace_members
    on workspace_members.workspace_id = invitation_drafts.workspace_id
  where invitation_drafts.invitation_id = p_invitation_id
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
  for update of invitation_drafts;

  if not found then
    raise exception 'Invitation draft not found' using errcode = 'P0002';
  end if;

  select
    publication_versions.id,
    publication_versions.invitation_id,
    publication_versions.draft_revision,
    publication_versions.snapshot
  into existing_publication
  from public.publication_versions
  where publication_versions.workspace_id = current_workspace_id
    and publication_versions.idempotency_key = p_idempotency_key;

  if found then
    if existing_publication.invitation_id <> p_invitation_id
      or existing_publication.draft_revision <> p_expected_draft_revision
      or existing_publication.snapshot <> p_snapshot then
      raise exception 'Publication idempotency key was reused with different input'
        using errcode = '22023';
    end if;

    return existing_publication.id;
  end if;

  if current_draft_revision <> p_expected_draft_revision then
    raise exception 'Invitation draft revision conflict' using errcode = '40001';
  end if;

  if current_template_version_id <> '40000000-0000-4000-8000-000000000001'::uuid
    or p_snapshot ->> 'snapshotVersion' <> '1'
    or p_snapshot ->> 'invitationSchemaVersion' <> '1'
    or p_snapshot ->> 'rendererKey' <> 'garden-promise-v1'
    or p_snapshot ->> 'rendererVersion' <> '1'
    or p_snapshot ->> 'templateVersionId' <> current_template_version_id::text
    or p_snapshot ->> 'templateVersion' <> '1'
    or p_snapshot ->> 'draftRevision' <> current_draft_revision::text
    or p_snapshot -> 'document' <> current_document
    or p_snapshot -> 'assets' <> '[]'::jsonb
    or current_document -> 'assets' <> '[]'::jsonb then
    raise exception 'Publication snapshot does not match the supported draft contract'
      using errcode = '22023';
  end if;

  select coalesce(max(publication_versions.publication_number), 0) + 1
  into next_publication_number
  from public.publication_versions
  where publication_versions.invitation_id = p_invitation_id;

  insert into public.publication_versions (
    workspace_id,
    invitation_id,
    publication_number,
    idempotency_key,
    snapshot_version,
    invitation_schema_version,
    renderer_key,
    renderer_version,
    template_version_id,
    template_version,
    draft_revision,
    snapshot
  )
  values (
    current_workspace_id,
    p_invitation_id,
    next_publication_number,
    p_idempotency_key,
    1,
    1,
    'garden-promise-v1',
    1,
    current_template_version_id,
    1,
    current_draft_revision,
    p_snapshot
  )
  returning id into created_publication_id;

  insert into public.publication_builds (
    publication_id,
    workspace_id,
    invitation_id
  )
  values (
    created_publication_id,
    current_workspace_id,
    p_invitation_id
  );

  insert into public.publication_aliases (workspace_id, invitation_id)
  values (current_workspace_id, p_invitation_id)
  on conflict (invitation_id) do nothing;

  return created_publication_id;
end;
$$;

create or replace function public.complete_invitation_publication(
  p_publication_id uuid,
  p_artifact_key text,
  p_artifact_sha256 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_build record;
begin
  p_artifact_key := btrim(p_artifact_key);
  p_artifact_sha256 := lower(btrim(p_artifact_sha256));

  if p_publication_id is null
    or p_artifact_key is null
    or char_length(p_artifact_key) not between 1 and 512
    or p_artifact_key !~ '^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$'
    or p_artifact_key like '%..%'
    or p_artifact_key like '%//%'
    or p_artifact_sha256 is null
    or p_artifact_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid publication artifact' using errcode = '22023';
  end if;

  select status, artifact_key, artifact_sha256
  into current_build
  from public.publication_builds
  where publication_id = p_publication_id
  for update;

  if not found then
    raise exception 'Publication build not found' using errcode = 'P0002';
  end if;

  if current_build.status = 'completed'
    and current_build.artifact_key = p_artifact_key
    and current_build.artifact_sha256 = p_artifact_sha256 then
    return;
  end if;

  if current_build.status <> 'pending' then
    raise exception 'Publication build cannot be completed from its current state'
      using errcode = '55000';
  end if;

  update public.publication_builds
  set
    status = 'completed',
    artifact_key = p_artifact_key,
    artifact_sha256 = p_artifact_sha256,
    completed_at = now()
  where publication_id = p_publication_id;
end;
$$;

create or replace function public.fail_invitation_publication(
  p_publication_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_build record;
begin
  p_error_code := lower(btrim(p_error_code));

  if p_publication_id is null
    or p_error_code is null
    or p_error_code !~ '^[a-z0-9][a-z0-9_-]{0,99}$' then
    raise exception 'Invalid publication failure code' using errcode = '22023';
  end if;

  select status, error_code
  into current_build
  from public.publication_builds
  where publication_id = p_publication_id
  for update;

  if not found then
    raise exception 'Publication build not found' using errcode = 'P0002';
  end if;

  if current_build.status = 'failed' and current_build.error_code = p_error_code then
    return;
  end if;

  if current_build.status <> 'pending' then
    raise exception 'Publication build cannot fail from its current state'
      using errcode = '55000';
  end if;

  update public.publication_builds
  set
    status = 'failed',
    error_code = p_error_code,
    failed_at = now()
  where publication_id = p_publication_id;
end;
$$;

create or replace function public.activate_invitation_publication(
  p_publication_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_workspace_id uuid;
  selected_invitation_id uuid;
  selected_status text;
  selected_public_identifier text;
begin
  select
    publication_versions.workspace_id,
    publication_versions.invitation_id,
    publication_builds.status
  into
    selected_workspace_id,
    selected_invitation_id,
    selected_status
  from public.publication_versions
  inner join public.publication_builds
    on publication_builds.publication_id = publication_versions.id
  where publication_versions.id = p_publication_id;

  if not found then
    raise exception 'Publication not found' using errcode = 'P0002';
  end if;

  if selected_status <> 'completed' then
    raise exception 'Only a completed publication can become active'
      using errcode = '55000';
  end if;

  update public.publication_aliases
  set active_publication_id = p_publication_id
  where workspace_id = selected_workspace_id
    and invitation_id = selected_invitation_id
  returning public_identifier into selected_public_identifier;

  if not found then
    raise exception 'Publication alias not found' using errcode = 'P0002';
  end if;

  return selected_public_identifier;
end;
$$;

revoke all on function public.request_invitation_publication(uuid, bigint, uuid, jsonb)
from public, anon, service_role;
grant execute on function public.request_invitation_publication(uuid, bigint, uuid, jsonb)
to authenticated;

revoke all on function public.complete_invitation_publication(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.complete_invitation_publication(uuid, text, text)
to service_role;

revoke all on function public.fail_invitation_publication(uuid, text)
from public, anon, authenticated;
grant execute on function public.fail_invitation_publication(uuid, text)
to service_role;

revoke all on function public.activate_invitation_publication(uuid)
from public, anon, authenticated;
grant execute on function public.activate_invitation_publication(uuid)
to service_role;

commit;
