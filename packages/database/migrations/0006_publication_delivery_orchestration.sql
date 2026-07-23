begin;

alter table public.publication_versions
add constraint publication_versions_invitation_revision_unique
unique (invitation_id, draft_revision);

alter table public.publication_builds
add column attempt_count integer not null default 0,
add column last_started_at timestamptz,
add constraint publication_builds_attempt_count_nonnegative check (attempt_count >= 0);

alter table public.publication_aliases
add column delivered_publication_id uuid,
add column delivery_status text not null default 'idle',
add column delivery_attempt_count integer not null default 0,
add column delivery_error_code text,
add column delivery_error_at timestamptz,
add column delivered_at timestamptz,
add constraint publication_aliases_delivered_publication_fk
  foreign key (workspace_id, invitation_id, delivered_publication_id)
  references public.publication_versions (workspace_id, invitation_id, id),
add constraint publication_aliases_delivery_status_supported check (
  delivery_status in ('idle', 'pending', 'retrying', 'failed', 'delivered')
),
add constraint publication_aliases_delivery_attempt_count_nonnegative check (
  delivery_attempt_count >= 0
),
add constraint publication_aliases_delivery_error_code_bounded check (
  delivery_error_code is null
  or delivery_error_code ~ '^[a-z0-9][a-z0-9_-]{0,99}$'
);

update public.publication_aliases
set delivery_status = case
  when active_publication_id is null then 'idle'
  else 'pending'
end;

alter table public.publication_aliases
add constraint publication_aliases_delivery_state_consistent check (
  (
    delivery_status = 'idle'
    and active_publication_id is null
    and delivered_publication_id is null
    and delivery_error_code is null
    and delivery_error_at is null
    and delivered_at is null
  )
  or (
    delivery_status = 'pending'
    and active_publication_id is not null
    and active_publication_id is distinct from delivered_publication_id
    and delivery_error_code is null
    and delivery_error_at is null
  )
  or (
    delivery_status in ('retrying', 'failed')
    and active_publication_id is not null
    and active_publication_id is distinct from delivered_publication_id
    and delivery_error_code is not null
    and delivery_error_at is not null
  )
  or (
    delivery_status = 'delivered'
    and active_publication_id is not null
    and active_publication_id = delivered_publication_id
    and delivery_error_code is null
    and delivery_error_at is null
    and delivered_at is not null
  )
);

alter function public.request_invitation_publication(uuid, bigint, uuid, jsonb)
rename to request_invitation_publication_v0005;

revoke all on function public.request_invitation_publication_v0005(uuid, bigint, uuid, jsonb)
from public, anon, authenticated, service_role;

create function public.request_invitation_publication(
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
  existing_publication record;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_invitation_id is null
    or p_expected_draft_revision is null
    or p_expected_draft_revision < 1
    or p_idempotency_key is null
    or p_snapshot is null
    or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Invalid publication request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_invitation_id::text, 7)
  );

  select publication_versions.id, publication_versions.snapshot
  into existing_publication
  from public.publication_versions
  inner join public.workspace_members
    on workspace_members.workspace_id = publication_versions.workspace_id
  where publication_versions.invitation_id = p_invitation_id
    and publication_versions.draft_revision = p_expected_draft_revision
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active';

  if found then
    if existing_publication.snapshot <> p_snapshot then
      raise exception 'Publication revision was reused with a different snapshot'
        using errcode = '22023';
    end if;

    return existing_publication.id;
  end if;

  return public.request_invitation_publication_v0005(
    p_invitation_id,
    p_expected_draft_revision,
    p_idempotency_key,
    p_snapshot
  );
end;
$$;

create function public.start_invitation_publication(p_publication_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  select status
  into current_status
  from public.publication_builds
  where publication_id = p_publication_id
  for update;

  if not found then
    raise exception 'Publication build not found' using errcode = 'P0002';
  end if;

  if current_status = 'completed' then
    return;
  end if;

  update public.publication_builds
  set
    status = 'pending',
    artifact_key = null,
    artifact_sha256 = null,
    error_code = null,
    completed_at = null,
    failed_at = null,
    attempt_count = attempt_count + 1,
    last_started_at = now()
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

  if current_build.status = 'completed'
    or (current_build.status = 'failed' and current_build.error_code = p_error_code) then
    return;
  end if;

  update public.publication_builds
  set
    status = 'failed',
    artifact_key = null,
    artifact_sha256 = null,
    error_code = p_error_code,
    completed_at = null,
    failed_at = now()
  where publication_id = p_publication_id;
end;
$$;

create function public.select_invitation_publication_delivery(p_publication_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_publication record;
  current_alias record;
  current_publication_number bigint;
begin
  select
    publication_versions.workspace_id,
    publication_versions.invitation_id,
    publication_versions.publication_number,
    publication_builds.status
  into selected_publication
  from public.publication_versions
  inner join public.publication_builds
    on publication_builds.publication_id = publication_versions.id
  where publication_versions.id = p_publication_id;

  if not found then
    raise exception 'Publication not found' using errcode = 'P0002';
  end if;

  if selected_publication.status <> 'completed' then
    raise exception 'Only a completed publication can be selected for delivery'
      using errcode = '55000';
  end if;

  select active_publication_id, delivered_publication_id
  into current_alias
  from public.publication_aliases
  where workspace_id = selected_publication.workspace_id
    and invitation_id = selected_publication.invitation_id
  for update;

  if not found then
    raise exception 'Publication alias not found' using errcode = 'P0002';
  end if;

  if current_alias.active_publication_id is not null then
    select publication_number
    into current_publication_number
    from public.publication_versions
    where id = current_alias.active_publication_id;

    if current_publication_number > selected_publication.publication_number then
      return false;
    end if;
  end if;

  update public.publication_aliases
  set
    active_publication_id = p_publication_id,
    delivery_status = case
      when delivered_publication_id = p_publication_id then 'delivered'
      else 'pending'
    end,
    delivery_attempt_count = case
      when delivered_publication_id = p_publication_id then delivery_attempt_count
      else 0
    end,
    delivery_error_code = null,
    delivery_error_at = null
  where workspace_id = selected_publication.workspace_id
    and invitation_id = selected_publication.invitation_id;

  return true;
end;
$$;

create function public.record_invitation_publication_delivery_failure(
  p_publication_id uuid,
  p_error_code text,
  p_is_terminal boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  p_error_code := lower(btrim(p_error_code));

  if p_publication_id is null
    or p_error_code is null
    or p_error_code !~ '^[a-z0-9][a-z0-9_-]{0,99}$'
    or p_is_terminal is null then
    raise exception 'Invalid publication delivery failure' using errcode = '22023';
  end if;

  update public.publication_aliases
  set
    delivery_status = case when p_is_terminal then 'failed' else 'retrying' end,
    delivery_attempt_count = delivery_attempt_count + 1,
    delivery_error_code = p_error_code,
    delivery_error_at = now()
  where active_publication_id = p_publication_id
    and delivered_publication_id is distinct from p_publication_id;

  return found;
end;
$$;

create function public.confirm_invitation_publication_delivery(p_publication_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.publication_builds
    where publication_id = p_publication_id
      and status = 'completed'
  ) then
    raise exception 'Only a completed publication can confirm delivery'
      using errcode = '55000';
  end if;

  update public.publication_aliases
  set
    delivered_publication_id = p_publication_id,
    delivery_status = 'delivered',
    delivery_error_code = null,
    delivery_error_at = null,
    delivered_at = now()
  where active_publication_id = p_publication_id;

  return found;
end;
$$;

create function public.rollback_invitation_publication(p_publication_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_publication record;
  selected_public_identifier text;
begin
  select
    publication_versions.workspace_id,
    publication_versions.invitation_id,
    publication_builds.status
  into selected_publication
  from public.publication_versions
  inner join public.publication_builds
    on publication_builds.publication_id = publication_versions.id
  where publication_versions.id = p_publication_id;

  if not found then
    raise exception 'Publication not found' using errcode = 'P0002';
  end if;

  if selected_publication.status <> 'completed' then
    raise exception 'Only a completed publication can be selected for rollback'
      using errcode = '55000';
  end if;

  update public.publication_aliases
  set
    active_publication_id = p_publication_id,
    delivery_status = case
      when delivered_publication_id = p_publication_id then 'delivered'
      else 'pending'
    end,
    delivery_attempt_count = case
      when delivered_publication_id = p_publication_id then delivery_attempt_count
      else 0
    end,
    delivery_error_code = null,
    delivery_error_at = null
  where workspace_id = selected_publication.workspace_id
    and invitation_id = selected_publication.invitation_id
  returning public_identifier into selected_public_identifier;

  if not found then
    raise exception 'Publication alias not found' using errcode = 'P0002';
  end if;

  return selected_public_identifier;
end;
$$;

create or replace function public.activate_invitation_publication(p_publication_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select public.rollback_invitation_publication(p_publication_id)
$$;

revoke all on function public.request_invitation_publication(uuid, bigint, uuid, jsonb)
from public, anon, service_role;
grant execute on function public.request_invitation_publication(uuid, bigint, uuid, jsonb)
to authenticated;

revoke all on function public.start_invitation_publication(uuid)
from public, anon, authenticated;
grant execute on function public.start_invitation_publication(uuid)
to service_role;

revoke all on function public.select_invitation_publication_delivery(uuid)
from public, anon, authenticated;
grant execute on function public.select_invitation_publication_delivery(uuid)
to service_role;

revoke all on function public.record_invitation_publication_delivery_failure(uuid, text, boolean)
from public, anon, authenticated;
grant execute on function public.record_invitation_publication_delivery_failure(uuid, text, boolean)
to service_role;

revoke all on function public.confirm_invitation_publication_delivery(uuid)
from public, anon, authenticated;
grant execute on function public.confirm_invitation_publication_delivery(uuid)
to service_role;

revoke all on function public.rollback_invitation_publication(uuid)
from public, anon, authenticated;
grant execute on function public.rollback_invitation_publication(uuid)
to service_role;

commit;
