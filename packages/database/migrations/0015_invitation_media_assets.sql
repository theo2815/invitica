begin;

-- Owner-supplied, bounded invitation images. One row per document asset id.
-- Originals stay private; renditions are the delivered responsive WebP set.
-- Writes flow only through the security-definer RPCs below; publication copies
-- renditions to immutable content-addressed keys, so a later draft change can
-- never mutate media already referenced by an active snapshot.
create table public.invitation_media_assets (
  id uuid primary key,
  workspace_id uuid not null,
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  kind text not null default 'image',
  role text not null,
  status text not null default 'ready',
  original_content_type text not null,
  original_byte_length bigint not null,
  original_sha256 text not null,
  original_object_key text not null,
  width integer not null,
  height integer not null,
  renditions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint invitation_media_assets_kind_image check (kind = 'image'),
  constraint invitation_media_assets_role_supported check (role in ('hero', 'gallery', 'gift')),
  constraint invitation_media_assets_status_supported check (status in ('ready', 'deleted')),
  constraint invitation_media_assets_content_type_supported check (
    original_content_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint invitation_media_assets_byte_length_bounded check (
    original_byte_length between 1 and 15 * 1024 * 1024
  ),
  constraint invitation_media_assets_sha256_hex check (original_sha256 ~ '^[0-9a-f]{64}$'),
  constraint invitation_media_assets_object_key_bounded check (
    char_length(original_object_key) between 1 and 512
  ),
  constraint invitation_media_assets_width_bounded check (width between 200 and 8000),
  constraint invitation_media_assets_height_bounded check (height between 200 and 8000),
  constraint invitation_media_assets_renditions_array check (
    jsonb_typeof(renditions) = 'array'
    and jsonb_array_length(renditions) between 1 and 4
  ),
  constraint invitation_media_assets_deleted_at_matches_status check (
    (status = 'deleted') = (deleted_at is not null)
  )
);

create index invitation_media_assets_invitation_id_idx
  on public.invitation_media_assets (invitation_id)
  where deleted_at is null;
create index invitation_media_assets_workspace_id_idx
  on public.invitation_media_assets (workspace_id);

create trigger invitation_media_assets_set_updated_at
before update on public.invitation_media_assets
for each row
execute function public.set_record_updated_at();

alter table public.invitation_media_assets enable row level security;

revoke all on table public.invitation_media_assets from public, anon, authenticated;
grant select on table public.invitation_media_assets to authenticated;

create policy invitation_media_assets_select_active_owner
on public.invitation_media_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = invitation_media_assets.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

-- Records a processed image for an owned invitation. Insert-only: replacing an
-- image uses a new asset id and soft-deletes the previous one.
create function public.record_invitation_image(
  p_invitation_id uuid,
  p_asset_id uuid,
  p_role text,
  p_original_content_type text,
  p_original_byte_length bigint,
  p_original_sha256 text,
  p_original_object_key text,
  p_width integer,
  p_height integer,
  p_renditions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_invitation_id is null or p_asset_id is null then
    raise exception 'Invalid media request' using errcode = '22023';
  end if;

  select invitations.workspace_id
  into target_workspace_id
  from public.invitations
  inner join public.workspace_members
    on workspace_members.workspace_id = invitations.workspace_id
  where invitations.id = p_invitation_id
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active';

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  insert into public.invitation_media_assets (
    id,
    workspace_id,
    invitation_id,
    role,
    original_content_type,
    original_byte_length,
    original_sha256,
    original_object_key,
    width,
    height,
    renditions
  )
  values (
    p_asset_id,
    target_workspace_id,
    p_invitation_id,
    p_role,
    p_original_content_type,
    p_original_byte_length,
    p_original_sha256,
    p_original_object_key,
    p_width,
    p_height,
    p_renditions
  );

  return p_asset_id;
end;
$$;

-- Owner-authorized soft delete. Does not remove immutable published renditions
-- or the private original; provider object cleanup is a separately authorized
-- lifecycle action.
create function public.soft_delete_invitation_image(p_asset_id uuid)
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

  if p_asset_id is null then
    raise exception 'Invalid media request' using errcode = '22023';
  end if;

  update public.invitation_media_assets as media
  set status = 'deleted',
      deleted_at = now()
  where media.id = p_asset_id
    and media.deleted_at is null
    and exists (
      select 1
      from public.workspace_members
      where workspace_members.workspace_id = media.workspace_id
        and workspace_members.user_id = current_user_id
        and workspace_members.role = 'owner'
        and workspace_members.status = 'active'
    );

  if not found then
    raise exception 'Media asset not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.record_invitation_image(
  uuid, uuid, text, text, bigint, text, text, integer, integer, jsonb
) from public, anon, service_role;
grant execute on function public.record_invitation_image(
  uuid, uuid, text, text, bigint, text, text, integer, integer, jsonb
) to authenticated;

revoke all on function public.soft_delete_invitation_image(uuid)
from public, anon, service_role;
grant execute on function public.soft_delete_invitation_image(uuid) to authenticated;

commit;
