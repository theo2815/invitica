begin;

-- Returns one bounded Guest Desk page after applying every search, filter, and sort
-- criterion to the complete active party set. The application requests one row beyond
-- its visible page size and uses that extra row only to determine whether more remain.
create function public.list_guest_parties_page(
  p_invitation_id uuid,
  p_search text,
  p_response_filter text,
  p_offset integer,
  p_limit integer
)
returns table (
  id uuid,
  internal_label text,
  recipient_name text,
  capacity integer,
  created_at timestamptz,
  archived_at timestamptz,
  revision bigint,
  copy_count integer,
  first_copied_at timestamptz,
  last_copied_at timestamptz,
  marked_sent_at timestamptz,
  guest_members jsonb,
  link_status text,
  response_attendance text,
  response_attendee_count integer,
  response_message text,
  response_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_workspace_id uuid;
begin
  p_search := btrim(coalesce(p_search, ''));
  p_response_filter := lower(btrim(coalesce(p_response_filter, 'all')));

  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_invitation_id is null
    or char_length(p_search) > 120
    or p_response_filter not in (
      'all',
      'already-sent',
      'attending',
      'awaiting',
      'declined',
      'not-yet-sent'
    )
    or p_offset is null
    or p_offset < 0
    or p_offset > 1000000
    or p_limit is null
    or p_limit not between 1 and 51 then
    raise exception 'Invalid guest party page request' using errcode = '22023';
  end if;

  select invitations.workspace_id
  into selected_workspace_id
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

  return query
  select
    guest_parties.id,
    guest_parties.internal_label,
    guest_parties.recipient_name,
    guest_parties.capacity,
    guest_parties.created_at,
    guest_parties.archived_at,
    guest_parties.revision,
    guest_parties.copy_count,
    guest_parties.first_copied_at,
    guest_parties.last_copied_at,
    guest_parties.marked_sent_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', guests.id, 'name', guests.name)
          order by guests.sort_order
        )
        from public.guests
        where guests.workspace_id = selected_workspace_id
          and guests.guest_party_id = guest_parties.id
      ),
      '[]'::jsonb
    ) as guest_members,
    case
      when exists (
        select 1
        from public.guest_party_links
        where guest_party_links.workspace_id = selected_workspace_id
          and guest_party_links.guest_party_id = guest_parties.id
          and guest_party_links.status = 'active'
      ) then 'active'
      else 'revoked'
    end as link_status,
    rsvp_responses.attendance as response_attendance,
    rsvp_responses.attendee_count as response_attendee_count,
    rsvp_responses.message as response_message,
    rsvp_responses.updated_at as response_updated_at
  from public.guest_parties
  left join public.rsvp_responses
    on rsvp_responses.workspace_id = guest_parties.workspace_id
    and rsvp_responses.invitation_id = guest_parties.invitation_id
    and rsvp_responses.guest_party_id = guest_parties.id
  where guest_parties.workspace_id = selected_workspace_id
    and guest_parties.invitation_id = p_invitation_id
    and guest_parties.archived_at is null
    and (
      p_search = ''
      or position(lower(p_search) in lower(guest_parties.internal_label)) > 0
      or position(lower(p_search) in lower(guest_parties.recipient_name)) > 0
      or exists (
        select 1
        from public.guests
        where guests.workspace_id = selected_workspace_id
          and guests.guest_party_id = guest_parties.id
          and position(lower(p_search) in lower(guests.name)) > 0
      )
    )
    and (
      p_response_filter = 'all'
      or (p_response_filter = 'already-sent' and guest_parties.marked_sent_at is not null)
      or (p_response_filter = 'not-yet-sent' and guest_parties.marked_sent_at is null)
      or (p_response_filter = 'attending' and rsvp_responses.attendance = 'attending')
      or (p_response_filter = 'declined' and rsvp_responses.attendance = 'declined')
      or (p_response_filter = 'awaiting' and rsvp_responses.id is null)
    )
  order by
    (guest_parties.marked_sent_at is not null),
    rsvp_responses.updated_at desc nulls last,
    lower(guest_parties.internal_label),
    guest_parties.id
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.list_guest_parties_page(uuid, text, text, integer, integer)
  from public, anon, service_role;
grant execute on function public.list_guest_parties_page(uuid, text, text, integer, integer)
  to authenticated;

commit;
