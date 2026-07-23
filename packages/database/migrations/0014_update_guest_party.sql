begin;

create function public.update_guest_party(
  p_guest_party_id uuid,
  p_expected_revision bigint,
  p_internal_label text,
  p_recipient_name text,
  p_capacity integer,
  p_guest_names text[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_party record;
  selected_guest_names text[];
  current_attendee_count integer;
  saved_revision bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  p_internal_label := btrim(p_internal_label);
  p_recipient_name := btrim(p_recipient_name);
  selected_guest_names := coalesce(
    array(
      select btrim(guest_name)
      from unnest(coalesce(p_guest_names, array[]::text[]))
        with ordinality as names(guest_name, ordinal)
      order by ordinal
    ),
    array[]::text[]
  );

  if p_guest_party_id is null
    or p_expected_revision is null
    or p_expected_revision < 1
    or p_internal_label is null
    or char_length(p_internal_label) not between 1 and 120
    or p_recipient_name is null
    or char_length(p_recipient_name) not between 1 and 120
    or p_capacity is null
    or p_capacity not between 1 and 50
    or cardinality(selected_guest_names) > p_capacity
    or exists (
      select 1
      from unnest(selected_guest_names) as guest_name
      where guest_name is null or char_length(guest_name) not between 1 and 120
    ) then
    raise exception 'Invalid guest-party update' using errcode = '22023';
  end if;

  select
    guest_parties.workspace_id,
    guest_parties.invitation_id,
    guest_parties.revision
  into selected_party
  from public.guest_parties
  inner join public.workspace_members
    on workspace_members.workspace_id = guest_parties.workspace_id
  where guest_parties.id = p_guest_party_id
    and guest_parties.archived_at is null
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
  for update of guest_parties;

  if not found then
    raise exception 'Guest party not found' using errcode = 'P0002';
  end if;
  if selected_party.revision <> p_expected_revision then
    raise exception 'Guest party revision conflict' using errcode = '40001';
  end if;

  select coalesce(max(rsvp_responses.attendee_count), 0)
  into current_attendee_count
  from public.rsvp_responses
  where rsvp_responses.workspace_id = selected_party.workspace_id
    and rsvp_responses.invitation_id = selected_party.invitation_id
    and rsvp_responses.guest_party_id = p_guest_party_id
    and rsvp_responses.attendance = 'attending';

  if p_capacity < current_attendee_count then
    raise exception 'Party capacity cannot be below the current attendee count'
      using errcode = '23514';
  end if;

  delete from public.guests
  where workspace_id = selected_party.workspace_id
    and invitation_id = selected_party.invitation_id
    and guest_party_id = p_guest_party_id;

  insert into public.guests (
    workspace_id,
    invitation_id,
    guest_party_id,
    name,
    sort_order
  )
  select
    selected_party.workspace_id,
    selected_party.invitation_id,
    p_guest_party_id,
    guest_name,
    ordinal::integer
  from unnest(selected_guest_names) with ordinality as names(guest_name, ordinal);

  update public.guest_parties
  set
    internal_label = p_internal_label,
    recipient_name = p_recipient_name,
    capacity = p_capacity,
    revision = revision + 1
  where id = p_guest_party_id
  returning revision into saved_revision;

  return saved_revision;
end;
$$;

revoke all on function public.update_guest_party(uuid, bigint, text, text, integer, text[])
  from public, anon, service_role;
grant execute on function public.update_guest_party(uuid, bigint, text, text, integer, text[])
  to authenticated;

commit;
