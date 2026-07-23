begin;

create function public.delete_unpublished_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_invitation record;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_invitation_id is null then
    raise exception 'Invalid invitation deletion request' using errcode = '22023';
  end if;

  select invitations.workspace_id, invitations.event_id
  into selected_invitation
  from public.invitations
  inner join public.workspace_members
    on workspace_members.workspace_id = invitations.workspace_id
  where invitations.id = p_invitation_id
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
  for update of invitations;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.publication_versions
    where publication_versions.invitation_id = p_invitation_id
  ) then
    raise exception 'Published or submitted invitations require the revocation workflow'
      using errcode = '55000';
  end if;

  delete from public.invitations
  where id = p_invitation_id
    and workspace_id = selected_invitation.workspace_id;

  delete from public.events
  where id = selected_invitation.event_id
    and workspace_id = selected_invitation.workspace_id
    and not exists (
      select 1
      from public.invitations
      where invitations.event_id = selected_invitation.event_id
    );
end;
$$;

revoke all on function public.delete_unpublished_invitation(uuid)
from public, anon, service_role;
grant execute on function public.delete_unpublished_invitation(uuid)
to authenticated;

commit;
