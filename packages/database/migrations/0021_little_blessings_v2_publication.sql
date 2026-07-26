begin;

-- Registers Little Blessings v2 as a publishable immutable contract. The
-- helper is restated unchanged with `create or replace`; the publication RPC
-- remains an explicit allowlist, now including the renderer version in each
-- tuple so a v2 snapshot cannot claim v1 renderer semantics. Existing v1
-- publication rows and aliases are untouched.

-- Publication beyond Garden Promise.
--
-- 0005 accepted exactly one template: it compared the draft's template version
-- against the Garden Promise UUID, required the renderer key to be literally
-- 'garden-promise-v1', and required both the snapshot's and the document's
-- asset arrays to be empty. That was truthful when one template existed and
-- media did not. Little Blessings has a second renderer and carries up to
-- sixteen photographs, so those three pins have to widen.
--
-- They widen; they are not removed. An unknown template still cannot publish,
-- and the asset manifest is now checked properly rather than merely required to
-- be empty: every published image must resolve to a content-addressed immutable
-- key derived from its own digest, and the manifest must cover the document's
-- asset references exactly — no extra entries, none missing. A later draft edit
-- therefore still cannot mutate an active publication, because the key a
-- snapshot points at is a function of the bytes it was published with.
--
-- Audio remains unpublishable. The document contract can express an audio
-- reference, but no upload path, rendition pipeline, or Viewer route exists for
-- it, so a document that references one is rejected here rather than published
-- with media that cannot be served.

-- Validates one publication asset manifest against the document it belongs to.
-- Not part of the API: execution is revoked from every client role and it is
-- only ever reached through the security-definer publication RPC.
create or replace function public.publication_assets_are_valid(p_document jsonb, p_assets jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry jsonb;
  rendition jsonb;
  digest text;
  rendition_width integer;
  document_asset_ids text[];
  manifest_asset_ids text[];
begin
  if jsonb_typeof(p_assets) <> 'array' or jsonb_typeof(p_document -> 'assets') <> 'array' then
    return false;
  end if;

  -- Only image assets can be delivered today, so a document that references any
  -- other kind cannot be published at all.
  if exists (
    select 1
    from jsonb_array_elements(p_document -> 'assets') as document_asset(value)
    where document_asset.value ->> 'kind' is distinct from 'image'
  ) then
    return false;
  end if;

  select pg_catalog.array_agg(
    pg_catalog.lower(document_asset.value ->> 'id')
    order by pg_catalog.lower(document_asset.value ->> 'id')
  )
  into document_asset_ids
  from jsonb_array_elements(p_document -> 'assets') as document_asset(value);

  for entry in select value from jsonb_array_elements(p_assets) loop
    if jsonb_typeof(entry) <> 'object' then
      return false;
    end if;

    if exists (
      select 1
      from jsonb_object_keys(entry) as present(key)
      where present.key <> all (
        array['id', 'kind', 'contentType', 'width', 'height', 'renditions']
      )
    ) then
      return false;
    end if;

    if entry ->> 'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or entry ->> 'kind' <> 'image'
      or entry ->> 'contentType' <> 'image/webp'
      or jsonb_typeof(entry -> 'width') <> 'number'
      or jsonb_typeof(entry -> 'height') <> 'number'
      or (entry ->> 'width')::numeric <= 0
      or (entry ->> 'height')::numeric <= 0
      or jsonb_typeof(entry -> 'renditions') <> 'array'
      or pg_catalog.jsonb_array_length(entry -> 'renditions') not between 1 and 4 then
      return false;
    end if;

    for rendition in select value from jsonb_array_elements(entry -> 'renditions') loop
      if jsonb_typeof(rendition) <> 'object' then
        return false;
      end if;

      if exists (
        select 1
        from jsonb_object_keys(rendition) as present(key)
        where present.key <> all (
          array['byteLength', 'height', 'objectKey', 'sha256', 'width']
        )
      ) then
        return false;
      end if;

      digest := rendition ->> 'sha256';

      if digest !~ '^[0-9a-f]{64}$'
        or jsonb_typeof(rendition -> 'width') <> 'number'
        or jsonb_typeof(rendition -> 'height') <> 'number'
        or jsonb_typeof(rendition -> 'byteLength') <> 'number'
        or (rendition ->> 'width')::numeric <= 0
        or (rendition ->> 'height')::numeric <= 0
        or (rendition ->> 'byteLength')::numeric <= 0
        or (rendition ->> 'width')::numeric <> pg_catalog.floor((rendition ->> 'width')::numeric) then
        return false;
      end if;

      rendition_width := (rendition ->> 'width')::integer;

      -- The immutable content-addressed key the Viewer serves. Deriving it from
      -- the digest is what makes an already published snapshot unmutatable by a
      -- later draft edit.
      if rendition ->> 'objectKey' <> pg_catalog.concat(
        'publication-media/v1/', digest, '/w', rendition_width::text, '.webp'
      ) then
        return false;
      end if;
    end loop;
  end loop;

  select pg_catalog.array_agg(
    pg_catalog.lower(manifest_asset.value ->> 'id')
    order by pg_catalog.lower(manifest_asset.value ->> 'id')
  )
  into manifest_asset_ids
  from jsonb_array_elements(p_assets) as manifest_asset(value);

  -- Exactly the document's references, each once. An extra entry would publish
  -- media the invitation does not show; a missing one would publish a picture
  -- the Viewer cannot resolve.
  return coalesce(document_asset_ids, '{}'::text[]) = coalesce(manifest_asset_ids, '{}'::text[]);
end;
$$;

revoke all on function public.publication_assets_are_valid(jsonb, jsonb)
from public, anon, authenticated, service_role;

create or replace function public.request_invitation_publication_v0005(
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

  -- Every publishable template, named explicitly. A template version reaches
  -- this list only once its renderer, creator path, and media lifecycle are
  -- real, so an unfinished template still cannot publish even if the
  -- application tries.
  if not exists (
    select 1
    from (
      values
        ('40000000-0000-4000-8000-000000000001'::uuid, 'garden-promise-v1', 1, 1),
        ('40000000-0000-4000-8000-000000000004'::uuid, 'little-blessings-v1', 1, 1),
        ('40000000-0000-4000-8000-000000000005'::uuid, 'little-blessings-v2', 2, 2)
    ) as supported(template_version_id, renderer_key, template_version, renderer_version)
    where supported.template_version_id = current_template_version_id
      and supported.renderer_key = p_snapshot ->> 'rendererKey'
      and supported.template_version::text = p_snapshot ->> 'templateVersion'
      and supported.renderer_version::text = p_snapshot ->> 'rendererVersion'
  ) then
    raise exception 'Publication snapshot does not match the supported draft contract'
      using errcode = '22023';
  end if;

  if p_snapshot ->> 'snapshotVersion' <> '1'
    or p_snapshot ->> 'invitationSchemaVersion' <> '1'
    or p_snapshot ->> 'templateVersionId' <> current_template_version_id::text
    or p_snapshot ->> 'draftRevision' <> current_draft_revision::text
    or p_snapshot -> 'document' <> current_document
    or not public.publication_assets_are_valid(current_document, p_snapshot -> 'assets') then
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
    p_snapshot ->> 'rendererKey',
    (p_snapshot ->> 'rendererVersion')::integer,
    current_template_version_id,
    (p_snapshot ->> 'templateVersion')::integer,
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

-- create or replace preserves the privileges 0006 set, but the revoke is
-- repeated so applying this file to a database in any supported state leaves
-- the same result: reachable only through the wrapper.
revoke all on function public.request_invitation_publication_v0005(uuid, bigint, uuid, jsonb)
from public, anon, authenticated, service_role;

commit;
