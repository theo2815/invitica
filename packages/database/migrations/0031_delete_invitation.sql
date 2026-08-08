begin;

/*
  A creator may now delete any invitation they own, published or not.

  `0007`'s `delete_unpublished_invitation` refused a published invitation and
  pointed at a revocation workflow that was never built, so a published
  invitation could not be removed at all. This is a new function rather than a
  widening of that one, because "unpublished" is in its name and in its
  contract. `delete_unpublished_invitation` is deliberately left in place and
  loses its only caller: `0007`'s suite asserts its grants, and dropping it
  would break every creator delete between this migration and the web release
  that stops calling it. It is strictly narrower than the function below and
  grants no capability this one withholds.

  Deleting the invitation row is not by itself an unpublish. The guest Viewer
  resolves an invitation entirely from R2 — `publication-aliases/v1/{id}.json`,
  then the artifact it names — and never reads this database. The caller must
  therefore delete the alias object first; `apps/web/src/server/invitations/
  publication-purge.ts` owns that order. This function only removes the records,
  and the rows it leaves behind are removed by the cascades already declared on
  `invitation_drafts`, `invitation_media_assets`, `guest_parties`, `guests`,
  `guest_party_links`, `rsvp_responses`, `invitation_view_daily`,
  `publication_versions`, `publication_builds`, and `publication_aliases`.

  `publication_aliases.active_publication_id` and `.delivered_publication_id`
  reference `publication_versions` with no explicit ON DELETE, so they take the
  default NO ACTION. That check runs at end of statement, by which point one
  cascade has removed the alias row and the other its referent, so the delete
  succeeds. `0031_delete_invitation.test.sql` asserts this against a published
  fixture rather than leaving it to inference.
*/

create function public.delete_invitation(p_invitation_id uuid)
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

revoke all on function public.delete_invitation(uuid)
from public, anon, service_role;
grant execute on function public.delete_invitation(uuid)
to authenticated;

commit;
