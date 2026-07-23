begin;

create table public.rsvp_responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invitation_id uuid not null,
  guest_party_id uuid not null,
  attendance text not null,
  attendee_count integer not null,
  message text,
  revision bigint not null default 1,
  last_mutation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rsvp_responses_party_fk
    foreign key (workspace_id, invitation_id, guest_party_id)
    references public.guest_parties (workspace_id, invitation_id, id)
    on delete cascade,
  constraint rsvp_responses_party_unique unique (guest_party_id),
  constraint rsvp_responses_workspace_mutation_unique unique (workspace_id, last_mutation_id),
  constraint rsvp_responses_attendance_supported check (
    attendance in ('attending', 'declined')
  ),
  constraint rsvp_responses_attendee_count_bounded check (
    attendee_count between 0 and 50
  ),
  constraint rsvp_responses_attendance_count_consistent check (
    (attendance = 'attending' and attendee_count >= 1)
    or (attendance = 'declined' and attendee_count = 0)
  ),
  constraint rsvp_responses_message_bounded check (
    message is null or char_length(btrim(message)) between 1 and 500
  ),
  constraint rsvp_responses_revision_positive check (revision >= 1)
);

create index rsvp_responses_workspace_invitation_updated_idx
on public.rsvp_responses (workspace_id, invitation_id, updated_at desc, id);

create trigger rsvp_responses_set_updated_at
before update on public.rsvp_responses
for each row execute function public.set_record_updated_at();

alter table public.rsvp_responses enable row level security;

revoke all on table public.rsvp_responses from public, anon, authenticated, service_role;
grant select on table public.rsvp_responses to authenticated;

create policy rsvp_responses_select_active_owner
on public.rsvp_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = rsvp_responses.workspace_id
      and workspace_members.user_id = (select auth.uid())
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  )
);

create function public.resolve_guest_rsvp_context(
  p_public_identifier text,
  p_token_hash text
)
returns table (
  recipient_name text,
  party_capacity integer,
  has_rsvp_section boolean,
  can_respond boolean,
  rsvp_deadline timestamptz,
  response_attendance text,
  response_attendee_count integer,
  response_message text,
  response_revision bigint,
  response_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    guest_parties.recipient_name,
    guest_parties.capacity,
    coalesce(rsvp_section.is_present, false),
    coalesce(rsvp_section.is_present, false)
      and (rsvp_section.deadline is null or pg_catalog.now() <= rsvp_section.deadline),
    rsvp_section.deadline,
    rsvp_responses.attendance,
    rsvp_responses.attendee_count,
    rsvp_responses.message,
    rsvp_responses.revision,
    rsvp_responses.updated_at
  from public.guest_party_links
  inner join public.guest_parties
    on guest_parties.workspace_id = guest_party_links.workspace_id
    and guest_parties.invitation_id = guest_party_links.invitation_id
    and guest_parties.id = guest_party_links.guest_party_id
  inner join public.publication_aliases
    on publication_aliases.workspace_id = guest_party_links.workspace_id
    and publication_aliases.invitation_id = guest_party_links.invitation_id
  inner join public.publication_versions
    on publication_versions.workspace_id = publication_aliases.workspace_id
    and publication_versions.invitation_id = publication_aliases.invitation_id
    and publication_versions.id = publication_aliases.delivered_publication_id
  left join lateral (
    select
      true as is_present,
      nullif(section.value #>> '{props,deadline}', '')::timestamptz as deadline
    from jsonb_array_elements(publication_versions.snapshot #> '{document,sections}') as section(value)
    where section.value ->> 'type' = 'rsvp'
      and section.value ->> 'visible' = 'true'
    limit 1
  ) as rsvp_section on true
  left join public.rsvp_responses
    on rsvp_responses.workspace_id = guest_party_links.workspace_id
    and rsvp_responses.invitation_id = guest_party_links.invitation_id
    and rsvp_responses.guest_party_id = guest_party_links.guest_party_id
  where guest_party_links.token_hash = lower(btrim(p_token_hash))
    and guest_party_links.status = 'active'
    and publication_aliases.public_identifier = lower(btrim(p_public_identifier))
    and publication_aliases.delivery_status = 'delivered'
    and publication_aliases.delivered_publication_id is not null
    and p_public_identifier ~ '^[0-9a-f]{32}$'
    and p_token_hash ~ '^[0-9a-fA-F]{64}$'
  limit 1
$$;

create function public.submit_guest_rsvp(
  p_public_identifier text,
  p_token_hash text,
  p_mutation_id uuid,
  p_expected_revision bigint,
  p_attendance text,
  p_attendee_count integer,
  p_message text
)
returns table (
  response_attendance text,
  response_attendee_count integer,
  response_message text,
  response_revision bigint,
  response_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_party record;
  existing_response record;
  saved_response record;
  response_exists boolean;
begin
  p_public_identifier := lower(btrim(p_public_identifier));
  p_token_hash := lower(btrim(p_token_hash));
  p_attendance := lower(btrim(p_attendance));
  p_message := nullif(btrim(p_message), '');

  if p_public_identifier is null
    or p_public_identifier !~ '^[0-9a-f]{32}$'
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_mutation_id is null
    or p_expected_revision is null
    or p_expected_revision < 0
    or p_attendance is null
    or p_attendance not in ('attending', 'declined')
    or p_attendee_count is null
    or p_attendee_count not between 0 and 50
    or (p_attendance = 'attending' and p_attendee_count < 1)
    or (p_attendance = 'declined' and p_attendee_count <> 0)
    or (p_message is not null and char_length(p_message) > 500) then
    raise exception 'Invalid RSVP response' using errcode = '22023';
  end if;

  select
    guest_parties.workspace_id,
    guest_parties.invitation_id,
    guest_parties.id as guest_party_id,
    guest_parties.capacity,
    rsvp_section.deadline
  into selected_party
  from public.guest_party_links
  inner join public.guest_parties
    on guest_parties.workspace_id = guest_party_links.workspace_id
    and guest_parties.invitation_id = guest_party_links.invitation_id
    and guest_parties.id = guest_party_links.guest_party_id
  inner join public.publication_aliases
    on publication_aliases.workspace_id = guest_party_links.workspace_id
    and publication_aliases.invitation_id = guest_party_links.invitation_id
  inner join public.publication_versions
    on publication_versions.workspace_id = publication_aliases.workspace_id
    and publication_versions.invitation_id = publication_aliases.invitation_id
    and publication_versions.id = publication_aliases.delivered_publication_id
  inner join lateral (
    select nullif(section.value #>> '{props,deadline}', '')::timestamptz as deadline
    from jsonb_array_elements(publication_versions.snapshot #> '{document,sections}') as section(value)
    where section.value ->> 'type' = 'rsvp'
      and section.value ->> 'visible' = 'true'
    limit 1
  ) as rsvp_section on true
  where guest_party_links.token_hash = p_token_hash
    and guest_party_links.status = 'active'
    and publication_aliases.public_identifier = p_public_identifier
    and publication_aliases.delivery_status = 'delivered'
    and publication_aliases.delivered_publication_id is not null
  for update of guest_party_links, guest_parties;

  if not found then
    raise exception 'RSVP unavailable' using errcode = 'P0002';
  end if;

  select *
  into existing_response
  from public.rsvp_responses
  where guest_party_id = selected_party.guest_party_id
  for update;
  response_exists := found;

  if response_exists and existing_response.last_mutation_id = p_mutation_id then
    if existing_response.attendance <> p_attendance
      or existing_response.attendee_count <> p_attendee_count
      or existing_response.message is distinct from p_message then
      raise exception 'RSVP mutation key was reused with different input'
        using errcode = '22023';
    end if;

    return query select
      existing_response.attendance::text,
      existing_response.attendee_count::integer,
      existing_response.message::text,
      existing_response.revision::bigint,
      existing_response.updated_at::timestamptz;
    return;
  end if;

  if selected_party.deadline is not null and pg_catalog.now() > selected_party.deadline then
    raise exception 'RSVP deadline has passed' using errcode = 'P0001';
  end if;

  if p_attendance = 'attending' and p_attendee_count > selected_party.capacity then
    raise exception 'RSVP party size exceeds capacity' using errcode = '22023';
  end if;

  if (not response_exists and p_expected_revision <> 0)
    or (response_exists and existing_response.revision <> p_expected_revision) then
    raise exception 'RSVP response revision conflict' using errcode = '40001';
  end if;

  if response_exists then
    update public.rsvp_responses
    set
      attendance = p_attendance,
      attendee_count = p_attendee_count,
      message = p_message,
      revision = revision + 1,
      last_mutation_id = p_mutation_id
    where guest_party_id = selected_party.guest_party_id
    returning * into saved_response;
  else
    insert into public.rsvp_responses (
      workspace_id,
      invitation_id,
      guest_party_id,
      attendance,
      attendee_count,
      message,
      last_mutation_id
    )
    values (
      selected_party.workspace_id,
      selected_party.invitation_id,
      selected_party.guest_party_id,
      p_attendance,
      p_attendee_count,
      p_message,
      p_mutation_id
    )
    returning * into saved_response;
  end if;

  return query select
    saved_response.attendance::text,
    saved_response.attendee_count::integer,
    saved_response.message::text,
    saved_response.revision::bigint,
    saved_response.updated_at::timestamptz;
end;
$$;

revoke all on function public.resolve_guest_rsvp_context(text, text)
from public, anon, authenticated;
grant execute on function public.resolve_guest_rsvp_context(text, text)
to service_role;

revoke all on function public.submit_guest_rsvp(text, text, uuid, bigint, text, integer, text)
from public, anon, authenticated;
grant execute on function public.submit_guest_rsvp(text, text, uuid, bigint, text, integer, text)
to service_role;

commit;
