begin;

-- A publication is immutable history. It belongs to an invitation, but its
-- pinned template version must not be forced to equal that invitation's current
-- draft version forever. Retain workspace-scoped ownership while removing that
-- accidental coupling. The workspace-scoped invitation key already exists
-- from migration 0005.
alter table public.publication_versions
  drop constraint publication_versions_invitation_template_fk,
  add constraint publication_versions_invitation_fk
    foreign key (workspace_id, invitation_id)
    references public.invitations (workspace_id, id)
    on delete cascade;

-- Draft and invitation pins still move together. Deferral permits the RPC to
-- update both rows atomically without exposing an inconsistent committed state.
alter table public.invitation_drafts
  drop constraint invitation_drafts_invitation_template_fk,
  add constraint invitation_drafts_invitation_template_fk
    foreign key (workspace_id, invitation_id, template_version_id)
    references public.invitations (workspace_id, id, template_version_id)
    on delete cascade
    deferrable initially immediate;

create function public.upgrade_invitation_template(
  p_invitation_id uuid,
  p_expected_revision bigint,
  p_from_template_version_id uuid,
  p_to_template_version_id uuid,
  p_document jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  little_blessings_v1 constant uuid := '40000000-0000-4000-8000-000000000004';
  little_blessings_v2 constant uuid := '40000000-0000-4000-8000-000000000005';
  current_user_id uuid := auth.uid();
  current_workspace_id uuid;
  current_template_version_id uuid;
  current_revision bigint;
  current_document jsonb;
  expected_document jsonb;
  saved_revision bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_invitation_id is null
    or p_expected_revision is null
    or p_expected_revision < 1
    or p_from_template_version_id is null
    or p_to_template_version_id is null
    or p_document is null
    or jsonb_typeof(p_document) <> 'object' then
    raise exception 'Template upgrade input is invalid' using errcode = '22023';
  end if;

  -- Every supported migration is named explicitly. Adding a manifest in the
  -- application never grants it database mutation authority by accident.
  if not (
    p_from_template_version_id = little_blessings_v1
    and p_to_template_version_id = little_blessings_v2
  ) then
    raise exception 'Template upgrade is unavailable' using errcode = '55000';
  end if;

  select
    invitation_drafts.workspace_id,
    invitation_drafts.template_version_id,
    invitation_drafts.revision,
    invitation_drafts.document
  into
    current_workspace_id,
    current_template_version_id,
    current_revision,
    current_document
  from public.invitation_drafts
  inner join public.invitations
    on invitations.workspace_id = invitation_drafts.workspace_id
    and invitations.id = invitation_drafts.invitation_id
    and invitations.template_version_id = invitation_drafts.template_version_id
  inner join public.workspace_members
    on workspace_members.workspace_id = invitation_drafts.workspace_id
  where invitation_drafts.invitation_id = p_invitation_id
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
  for update of invitation_drafts, invitations;

  if not found then
    raise exception 'Invitation draft not found' using errcode = 'P0002';
  end if;

  if current_revision <> p_expected_revision then
    raise exception 'Invitation draft revision conflict' using errcode = '40001';
  end if;

  if current_template_version_id <> p_from_template_version_id
    or current_document ->> 'templateVersionId' <> p_from_template_version_id::text then
    raise exception 'Template upgrade is unavailable' using errcode = '55000';
  end if;

  expected_document := jsonb_set(
    current_document,
    '{templateVersionId}',
    to_jsonb(p_to_template_version_id::text),
    false
  );

  -- This equality is the preservation contract: content, visibility, order,
  -- theme, locale, opening, assets, and every future document field must match.
  if p_document <> expected_document then
    raise exception 'Template upgrade changed creator content' using errcode = '23514';
  end if;

  set constraints public.invitation_drafts_invitation_template_fk deferred;

  update public.invitation_drafts
  set
    template_version_id = p_to_template_version_id,
    document = p_document,
    revision = current_revision + 1
  where workspace_id = current_workspace_id
    and invitation_id = p_invitation_id
    and template_version_id = p_from_template_version_id
  returning revision into saved_revision;

  update public.invitations
  set
    template_version_id = p_to_template_version_id,
    updated_at = now()
  where workspace_id = current_workspace_id
    and id = p_invitation_id
    and template_version_id = p_from_template_version_id;

  return saved_revision;
end;
$$;

revoke all on function public.upgrade_invitation_template(uuid, bigint, uuid, uuid, jsonb)
from public, anon, service_role;
grant execute on function public.upgrade_invitation_template(uuid, bigint, uuid, uuid, jsonb)
to authenticated;

commit;
