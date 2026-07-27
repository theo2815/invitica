begin;

-- Resolves the visible Guest Desk's active private links in one owner-authorized call.
--
-- The earlier client path called `get_guest_party_link_secret` once per party through a
-- Server Action. Next.js serializes client-dispatched Server Actions, so that background
-- read could hold later creator mutations behind as many as twenty separate database
-- requests. This bounded batch keeps the accepted in-memory copy preparation while
-- removing the request waterfall.
create function public.get_guest_party_link_secrets(
  p_invitation_id uuid,
  p_guest_party_ids uuid[]
)
returns table (
  guest_party_id uuid,
  link_id uuid,
  recipient_name text,
  token_ciphertext text,
  token_nonce text,
  encryption_key_version integer
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_invitation_id is null
    or p_guest_party_ids is null
    or cardinality(p_guest_party_ids) not between 1 and 50
    or array_position(p_guest_party_ids, null) is not null
    or (
      select count(*) <> count(distinct requested.id)
      from unnest(p_guest_party_ids) as requested(id)
    ) then
    raise exception 'Invalid guest link batch' using errcode = '22023';
  end if;

  return query
  select
    guest_parties.id,
    guest_party_links.id,
    guest_parties.recipient_name,
    guest_party_links.token_ciphertext,
    guest_party_links.token_nonce,
    guest_party_links.encryption_key_version
  from unnest(p_guest_party_ids) with ordinality as requested(id, position)
  inner join public.guest_parties
    on guest_parties.id = requested.id
    and guest_parties.invitation_id = p_invitation_id
    and guest_parties.archived_at is null
  inner join public.workspace_members
    on workspace_members.workspace_id = guest_parties.workspace_id
    and workspace_members.user_id = (select auth.uid())
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
  inner join public.publication_aliases
    on publication_aliases.workspace_id = guest_parties.workspace_id
    and publication_aliases.invitation_id = guest_parties.invitation_id
    and publication_aliases.delivery_status = 'delivered'
    and publication_aliases.delivered_publication_id is not null
  inner join public.guest_party_links
    on guest_party_links.workspace_id = guest_parties.workspace_id
    and guest_party_links.invitation_id = guest_parties.invitation_id
    and guest_party_links.guest_party_id = guest_parties.id
    and guest_party_links.status = 'active'
    and guest_party_links.token_ciphertext is not null
    and guest_party_links.token_nonce is not null
    and guest_party_links.encryption_key_version is not null
  order by requested.position;
end;
$$;

revoke all on function public.get_guest_party_link_secrets(uuid, uuid[])
  from public, anon, service_role;
grant execute on function public.get_guest_party_link_secrets(uuid, uuid[])
  to authenticated;

commit;
