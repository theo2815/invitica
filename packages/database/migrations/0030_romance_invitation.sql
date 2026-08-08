begin;

alter table public.events
drop constraint events_occasion_supported;

alter table public.events
add constraint events_occasion_supported check (
  occasion in (
    'wedding', 'birthday', 'christening', 'baby_shower',
    'debut', 'anniversary', 'romance'
  )
);

insert into public.template_version_policies (
  template_version_id,
  template_id,
  template_version,
  invitation_schema_version,
  renderer_key,
  renderer_version,
  editor_key,
  allowed_section_types,
  editable_section_types,
  visibility_editable_section_types,
  required_visible_section_types
)
values (
  '40000000-0000-4000-8000-000000000009',
  'a-little-question',
  1,
  1,
  'little-question-v1',
  1,
  'section-document-v1',
  array['hero', 'message', 'event-details', 'gallery', 'rsvp'],
  array['hero', 'message', 'event-details', 'gallery', 'rsvp'],
  array['message', 'gallery'],
  array['hero', 'event-details', 'rsvp']
);

-- Keep the reviewed v0029 validator as the authority for unchanged section
-- types. The replacement adds the Romance response contract to RSVP sections.
alter function public.invitation_validate_section(text, boolean, jsonb)
rename to invitation_validate_section_v0029;

create function public.invitation_validate_section(
  p_section_type text,
  p_visible boolean,
  p_props jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  response_mode text;
begin
  if p_section_type is null
    or p_visible is null
    or p_props is null
    or jsonb_typeof(p_props) <> 'object' then
    raise exception 'An invitation section is invalid' using errcode = '22023';
  end if;

  if p_section_type <> 'rsvp' then
    perform public.invitation_validate_section_v0029(
      p_section_type,
      p_visible,
      p_props
    );
    return;
  end if;

  perform public.invitation_check_keys(
    p_props,
    array['heading', 'message', 'deadline', 'responseMode', 'declineButtonBehavior'],
    'The reply section'
  );
  perform public.invitation_check_scalar(
    p_props, 'message', false, 'text', 500, 'The reply message'
  );
  perform public.invitation_check_scalar(
    p_props, 'deadline', false, 'timestamp', 40, 'The reply deadline'
  );

  if not (p_props ? 'responseMode') then
    if p_props ? 'declineButtonBehavior' then
      raise exception 'The reply behavior requires a response mode' using errcode = '22023';
    end if;
    perform public.invitation_check_scalar(
      p_props, 'heading', false, 'text', 120, 'The reply heading'
    );
    return;
  end if;

  response_mode := p_props ->> 'responseMode';
  if response_mode is distinct from 'romantic-question'
    or p_props ->> 'declineButtonBehavior' not in ('static', 'dodge-five') then
    raise exception 'The romantic reply behavior is invalid' using errcode = '22023';
  end if;

  perform public.invitation_check_scalar(
    p_props, 'heading', true, 'text', 120, 'The romantic question'
  );
  perform public.invitation_check_scalar(
    p_props, 'responseMode', true, 'text', 40, 'The response mode'
  );
  perform public.invitation_check_scalar(
    p_props, 'declineButtonBehavior', true, 'text', 40, 'The reply behavior'
  );
end;
$$;

revoke all on function public.invitation_validate_section_v0029(text, boolean, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.invitation_validate_section(text, boolean, jsonb)
from public, anon, authenticated, service_role;

-- Romance links are personal by product definition. Application validation
-- provides useful copy; these triggers keep direct database writes honest.
create function public.enforce_romance_guest_party_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.capacity <> 1 and exists (
    select 1
    from public.invitations
    inner join public.events
      on events.workspace_id = invitations.workspace_id
      and events.id = invitations.event_id
    where invitations.workspace_id = new.workspace_id
      and invitations.id = new.invitation_id
      and events.occasion = 'romance'
  ) then
    raise exception 'A Romance invitation must have exactly one recipient'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guest_parties_enforce_romance_capacity
before insert or update of workspace_id, invitation_id, capacity
on public.guest_parties
for each row execute function public.enforce_romance_guest_party_capacity();

create function public.enforce_romance_decline_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.attendance = 'declined'
    and nullif(btrim(new.message), '') is null
    and exists (
      select 1
      from public.invitations
      inner join public.events
        on events.workspace_id = invitations.workspace_id
        and events.id = invitations.event_id
      where invitations.workspace_id = new.workspace_id
        and invitations.id = new.invitation_id
        and events.occasion = 'romance'
    ) then
    raise exception 'A decline message is required for a Romance invitation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger rsvp_responses_enforce_romance_decline_message
before insert or update of workspace_id, invitation_id, attendance, message
on public.rsvp_responses
for each row execute function public.enforce_romance_decline_message();

revoke all on function public.enforce_romance_guest_party_capacity()
from public, anon, authenticated, service_role;
revoke all on function public.enforce_romance_decline_message()
from public, anon, authenticated, service_role;

commit;
