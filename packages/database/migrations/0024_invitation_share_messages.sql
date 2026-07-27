begin;

-- The message a creator copies or shares when inviting guests. It is a creator-side tool: it is
-- never rendered to a guest and never enters a publication snapshot, which is why it lives on
-- `invitations` rather than inside the invitation document. Null means "use the generated
-- default", so a creator who never customises keeps inheriting improvements to that default.
--
-- `0002` grants table-wide select on `public.invitations`, which covers columns added later, so
-- these need no column grant. That is unlike `guest_parties`, where `0012` replaced the table-wide
-- grant with an explicit allowlist and every new column must be granted individually.
alter table public.invitations
  add column personal_share_message text,
  add column general_share_message text;

alter table public.invitations
  add constraint invitations_personal_share_message_bounds
    check (
      personal_share_message is null
      or char_length(personal_share_message) between 1 and 2000
    ),
  add constraint invitations_general_share_message_bounds
    check (
      general_share_message is null
      or char_length(general_share_message) between 1 and 2000
    );

-- Writes go through this function because `0002` grants only select and insert on `invitations`;
-- there is no update grant for `authenticated`, by design. Ownership, bounds, and the placeholder
-- allowlist are all re-checked here so a forged client request cannot bypass the application.
create function public.update_invitation_share_messages(
  p_invitation_id uuid,
  p_personal_message text,
  p_general_message text
)
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

  -- An all-whitespace message is a cleared message, not a one-character one.
  p_personal_message := nullif(btrim(coalesce(p_personal_message, '')), '');
  p_general_message := nullif(btrim(coalesce(p_general_message, '')), '');

  if p_invitation_id is null
    or (p_personal_message is not null and char_length(p_personal_message) > 2000)
    or (p_general_message is not null and char_length(p_general_message) > 2000)
    -- Without the link the message cannot reach the invitation at all.
    or (p_personal_message is not null and position('{link}' in p_personal_message) = 0)
    or (p_general_message is not null and position('{link}' in p_general_message) = 0)
    -- An unrecognised placeholder would be pasted to a guest verbatim, as literal "{name}".
    or exists (
      select 1
      from regexp_matches(coalesce(p_personal_message, ''), '\{([a-zA-Z]*)\}', 'g') as found(token)
      where found.token[1] not in ('recipient', 'celebrant', 'occasion', 'link')
    )
    or exists (
      select 1
      from regexp_matches(coalesce(p_general_message, ''), '\{([a-zA-Z]*)\}', 'g') as found(token)
      -- The general link addresses everyone at once, so it has no single recipient to name.
      where found.token[1] not in ('celebrant', 'occasion', 'link')
    ) then
    raise exception 'Invalid invitation share message' using errcode = '22023';
  end if;

  select invitations.id
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

  update public.invitations
  set
    personal_share_message = p_personal_message,
    general_share_message = p_general_message,
    updated_at = now()
  where id = p_invitation_id;
end;
$$;

revoke all on function public.update_invitation_share_messages(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.update_invitation_share_messages(uuid, text, text)
  to authenticated;

commit;
