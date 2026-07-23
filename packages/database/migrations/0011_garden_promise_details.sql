begin;

create function public.update_garden_promise_details(
  p_invitation_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_subtitle text,
  p_date_label text,
  p_venue_name text,
  p_venue_address text,
  p_map_url text,
  p_rsvp_message text,
  p_rsvp_deadline date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_document jsonb;
  current_revision bigint;
  hero_index integer;
  venue_index integer;
  rsvp_index integer;
  updated_hero jsonb;
  updated_venue jsonb;
  updated_rsvp jsonb;
  updated_document jsonb;
  saved_revision bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Expected revision must be positive' using errcode = '22023';
  end if;

  p_title := btrim(p_title);
  p_subtitle := nullif(btrim(p_subtitle), '');
  p_date_label := nullif(btrim(p_date_label), '');
  p_venue_name := btrim(p_venue_name);
  p_venue_address := btrim(p_venue_address);
  p_map_url := nullif(btrim(p_map_url), '');
  p_rsvp_message := nullif(btrim(p_rsvp_message), '');

  if p_title is null or char_length(p_title) not between 1 and 120 then
    raise exception 'Hero title must contain between 1 and 120 characters'
      using errcode = '22023';
  end if;

  if p_subtitle is not null and char_length(p_subtitle) > 240 then
    raise exception 'Hero subtitle must contain at most 240 characters'
      using errcode = '22023';
  end if;

  if p_date_label is not null and char_length(p_date_label) > 120 then
    raise exception 'Hero date label must contain at most 120 characters'
      using errcode = '22023';
  end if;

  if p_venue_name is null or char_length(p_venue_name) not between 1 and 120 then
    raise exception 'Venue name must contain between 1 and 120 characters'
      using errcode = '22023';
  end if;

  if p_venue_address is null or char_length(p_venue_address) not between 1 and 500 then
    raise exception 'Venue address must contain between 1 and 500 characters'
      using errcode = '22023';
  end if;

  if p_map_url is not null and (
    char_length(p_map_url) > 2048
    or p_map_url !~* '^https?://[^[:space:]]+$'
  ) then
    raise exception 'Map URL must use HTTP or HTTPS' using errcode = '22023';
  end if;

  if p_rsvp_message is not null and char_length(p_rsvp_message) > 500 then
    raise exception 'RSVP message must contain at most 500 characters'
      using errcode = '22023';
  end if;

  select invitation_drafts.document, invitation_drafts.revision
  into current_document, current_revision
  from public.invitation_drafts
  inner join public.workspace_members
    on workspace_members.workspace_id = invitation_drafts.workspace_id
  where invitation_drafts.invitation_id = p_invitation_id
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
  for update of invitation_drafts;

  if not found then
    raise exception 'Invitation draft not found' using errcode = 'P0002';
  end if;

  if current_revision <> p_expected_revision then
    raise exception 'Invitation draft revision conflict' using errcode = '40001';
  end if;

  if current_document ->> 'templateVersionId'
    <> '40000000-0000-4000-8000-000000000001' then
    raise exception 'Garden Promise details are unavailable for this template'
      using errcode = '23514';
  end if;

  select (section.ordinality - 1)::integer, section.value
  into hero_index, updated_hero
  from jsonb_array_elements(current_document -> 'sections')
    with ordinality as section(value, ordinality)
  where section.value ->> 'type' = 'hero'
  limit 1;

  if not found then
    raise exception 'Invitation document has no editable hero section' using errcode = '23514';
  end if;

  select (section.ordinality - 1)::integer, section.value
  into venue_index, updated_venue
  from jsonb_array_elements(current_document -> 'sections')
    with ordinality as section(value, ordinality)
  where section.value ->> 'type' = 'venue'
  limit 1;

  if not found then
    raise exception 'Invitation document has no editable venue section' using errcode = '23514';
  end if;

  select (section.ordinality - 1)::integer, section.value
  into rsvp_index, updated_rsvp
  from jsonb_array_elements(current_document -> 'sections')
    with ordinality as section(value, ordinality)
  where section.value ->> 'type' = 'rsvp'
  limit 1;

  if not found then
    raise exception 'Invitation document has no editable RSVP section' using errcode = '23514';
  end if;

  updated_hero := jsonb_set(updated_hero, '{props,title}', to_jsonb(p_title), true);
  if p_subtitle is null then
    updated_hero := updated_hero #- '{props,subtitle}';
  else
    updated_hero := jsonb_set(updated_hero, '{props,subtitle}', to_jsonb(p_subtitle), true);
  end if;
  if p_date_label is null then
    updated_hero := updated_hero #- '{props,dateLabel}';
  else
    updated_hero := jsonb_set(updated_hero, '{props,dateLabel}', to_jsonb(p_date_label), true);
  end if;

  updated_venue := jsonb_set(updated_venue, '{props,venueName}', to_jsonb(p_venue_name), true);
  updated_venue := jsonb_set(updated_venue, '{props,address}', to_jsonb(p_venue_address), true);
  if p_map_url is null then
    updated_venue := updated_venue #- '{props,mapUrl}';
  else
    updated_venue := jsonb_set(updated_venue, '{props,mapUrl}', to_jsonb(p_map_url), true);
  end if;

  if p_rsvp_message is null then
    updated_rsvp := updated_rsvp #- '{props,message}';
  else
    updated_rsvp := jsonb_set(updated_rsvp, '{props,message}', to_jsonb(p_rsvp_message), true);
  end if;
  if p_rsvp_deadline is null then
    updated_rsvp := updated_rsvp #- '{props,deadline}';
  else
    updated_rsvp := jsonb_set(
      updated_rsvp,
      '{props,deadline}',
      to_jsonb(p_rsvp_deadline::text || 'T23:59:59+08:00'),
      true
    );
  end if;

  updated_document := jsonb_set(
    current_document,
    array['sections', hero_index::text],
    updated_hero,
    false
  );
  updated_document := jsonb_set(
    updated_document,
    array['sections', venue_index::text],
    updated_venue,
    false
  );
  updated_document := jsonb_set(
    updated_document,
    array['sections', rsvp_index::text],
    updated_rsvp,
    false
  );

  update public.invitation_drafts
  set
    document = updated_document,
    revision = current_revision + 1
  where invitation_id = p_invitation_id
  returning revision into saved_revision;

  return saved_revision;
end;
$$;

revoke all on function public.update_garden_promise_details(
  uuid, bigint, text, text, text, text, text, text, text, date
) from public, anon;
grant execute on function public.update_garden_promise_details(
  uuid, bigint, text, text, text, text, text, text, text, date
) to authenticated;

commit;
