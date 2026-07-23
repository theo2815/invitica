begin;

create or replace function public.create_invitation_draft(
  p_invitation_id uuid,
  p_template_version_id uuid,
  p_event_name text,
  p_occasion text,
  p_event_timezone text,
  p_locale text,
  p_document jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  personal_workspace_id uuid;
  created_event_id uuid;
  existing_record record;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select workspaces.id
  into personal_workspace_id
  from public.workspaces
  inner join public.workspace_members
    on workspace_members.workspace_id = workspaces.id
  where workspaces.personal_owner_user_id = current_user_id
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active';

  if personal_workspace_id is null then
    raise exception 'An active personal workspace is required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_invitation_id::text, 0)
  );

  select
    invitations.template_version_id,
    events.name as event_name,
    events.occasion,
    events.event_timezone,
    events.locale,
    invitation_drafts.document
  into existing_record
  from public.invitations
  inner join public.events
    on events.workspace_id = invitations.workspace_id
    and events.id = invitations.event_id
  inner join public.invitation_drafts
    on invitation_drafts.workspace_id = invitations.workspace_id
    and invitation_drafts.invitation_id = invitations.id
  where invitations.workspace_id = personal_workspace_id
    and invitations.id = p_invitation_id;

  if found then
    if existing_record.template_version_id <> p_template_version_id
      or existing_record.event_name <> p_event_name
      or existing_record.occasion <> p_occasion
      or existing_record.event_timezone <> p_event_timezone
      or existing_record.locale <> p_locale
      or existing_record.document <> p_document then
      raise exception 'Invitation creation key was reused with different input'
        using errcode = '22023';
    end if;

    return p_invitation_id;
  end if;

  insert into public.events (
    workspace_id,
    name,
    occasion,
    event_timezone,
    locale
  )
  values (
    personal_workspace_id,
    p_event_name,
    p_occasion,
    p_event_timezone,
    p_locale
  )
  returning id into created_event_id;

  insert into public.invitations (
    id,
    workspace_id,
    event_id,
    template_version_id
  )
  values (
    p_invitation_id,
    personal_workspace_id,
    created_event_id,
    p_template_version_id
  );

  insert into public.invitation_drafts (
    invitation_id,
    workspace_id,
    template_version_id,
    document
  )
  values (
    p_invitation_id,
    personal_workspace_id,
    p_template_version_id,
    p_document
  );

  return p_invitation_id;
end;
$$;

revoke all on function public.create_invitation_draft(uuid, uuid, text, text, text, text, jsonb)
from public, anon;
grant execute on function public.create_invitation_draft(uuid, uuid, text, text, text, text, jsonb)
to authenticated;

commit;
