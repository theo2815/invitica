begin;

-- Bounded Little Blessings creator editing.
--
-- Shape follows 0011 (owner-only, revision-checked, template-pinned, no direct
-- document write privilege), but Little Blessings edits eleven sections rather
-- than three scalar groups, so the payload is one JSONB object keyed by section
-- type instead of forty positional parameters:
--
--   { "<section type>": { "visible": <boolean>, "props": { ... } }, ... }
--
-- Only section types already present in the stored document may appear. A
-- listed section has its `visible` flag and its whole `props` object replaced;
-- an omitted section is left exactly as it was. Sections are never added,
-- removed, or reordered here — the curated order is a template property, not a
-- creator-facing one — and a hidden section stays in the document so
-- publication keeps a complete record.
--
-- Text is validated but not rewritten. Rebuilding trimmed copies of deeply
-- nested JSON in PL/pgSQL would be far more code than it is worth, so instead
-- every string must arrive already trimmed and non-empty; the caller drops
-- blank optional fields rather than sending "". 0011 trims its flat scalar
-- parameters instead, which is the right call for that shape and the wrong one
-- for this.

-- Scalar field validator shared by the section checks below. Not part of the
-- API: execution is revoked from every client role and it is only ever reached
-- through the security-definer RPC, which runs as its owner.
create function public.little_blessings_check_scalar(
  p_object jsonb,
  p_key text,
  p_required boolean,
  p_kind text,
  p_max_length integer,
  p_label text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  raw_value text;
begin
  if p_object -> p_key is null then
    if p_required then
      raise exception '% is required' , p_label using errcode = '22023';
    end if;

    return;
  end if;

  if jsonb_typeof(p_object -> p_key) <> 'string' then
    raise exception '% must be text', p_label using errcode = '22023';
  end if;

  raw_value := p_object ->> p_key;

  if raw_value <> btrim(raw_value) then
    raise exception '% must not begin or end with whitespace', p_label using errcode = '22023';
  end if;

  if char_length(raw_value) not between 1 and p_max_length then
    raise exception '% must contain between 1 and % characters', p_label, p_max_length
      using errcode = '22023';
  end if;

  case p_kind
    when 'text' then
      null;
    when 'uuid' then
      if raw_value !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception '% must be an asset identifier', p_label using errcode = '22023';
      end if;
    when 'timestamp' then
      if raw_value !~
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
        raise exception '% must be a date and time with a time zone offset', p_label
          using errcode = '22023';
      end if;
    when 'color' then
      if raw_value !~ '^#[0-9a-fA-F]{6}$' then
        raise exception '% must be a six-digit hex color', p_label using errcode = '22023';
      end if;
    when 'url' then
      if raw_value !~* '^https?://[^[:space:]]+$' then
        raise exception '% must use HTTP or HTTPS', p_label using errcode = '22023';
      end if;
  end case;
end;
$$;

-- Rejects any field the strict document contract does not define, so the RPC
-- cannot be used to smuggle unmodelled data into a stored invitation.
create function public.little_blessings_check_keys(
  p_object jsonb,
  p_allowed text[],
  p_label text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  unexpected text;
begin
  select object_key
  into unexpected
  from jsonb_object_keys(p_object) as object_key
  where object_key <> all (p_allowed)
  limit 1;

  if found then
    raise exception '% does not support the field "%"', p_label, unexpected
      using errcode = '22023';
  end if;
end;
$$;

create function public.little_blessings_check_array(
  p_object jsonb,
  p_key text,
  p_required boolean,
  p_min_length integer,
  p_max_length integer,
  p_label text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_object -> p_key is null then
    if p_required then
      raise exception '% is required', p_label using errcode = '22023';
    end if;

    return;
  end if;

  if jsonb_typeof(p_object -> p_key) <> 'array' then
    raise exception '% must be a list', p_label using errcode = '22023';
  end if;

  if jsonb_array_length(p_object -> p_key) not between p_min_length and p_max_length then
    raise exception '% must contain between % and % entries',
      p_label, p_min_length, p_max_length
      using errcode = '22023';
  end if;
end;
$$;

create function public.update_little_blessings_details(
  p_invitation_id uuid,
  p_expected_revision bigint,
  p_details jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  little_blessings_template constant uuid := '40000000-0000-4000-8000-000000000004';
  -- The celebrant's name, date, and portrait live in the hero, which also feeds
  -- the envelope cover plate; without the ceremony date, time, and venue the
  -- invitation cannot do its job. Neither may be hidden, in the editor or here.
  required_types constant text[] := array['hero', 'event-details'];
  editable_types constant text[] := array[
    'hero', 'message', 'countdown', 'event-details', 'participants',
    'schedule', 'attire', 'gallery', 'guidance', 'gifts', 'rsvp'
  ];
  current_user_id uuid := auth.uid();
  current_document jsonb;
  current_revision bigint;
  detail_key text;
  detail_value jsonb;
  props jsonb;
  entry jsonb;
  nested jsonb;
  section jsonb;
  image_ids uuid[] := '{}';
  updated_sections jsonb;
  retained_assets jsonb;
  image_assets jsonb;
  updated_document jsonb;
  saved_revision bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Expected revision must be positive' using errcode = '22023';
  end if;

  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Invitation details must be an object' using errcode = '22023';
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

  if current_document ->> 'templateVersionId' <> little_blessings_template::text then
    raise exception 'Little Blessings details are unavailable for this template'
      using errcode = '23514';
  end if;

  for detail_key, detail_value in select * from jsonb_each(p_details) loop
    if detail_key <> all (editable_types) then
      raise exception 'The "%" section is not editable', detail_key using errcode = '22023';
    end if;

    if jsonb_typeof(detail_value) <> 'object' then
      raise exception 'The "%" section must be an object', detail_key using errcode = '22023';
    end if;

    perform public.little_blessings_check_keys(
      detail_value, array['visible', 'props'], format('The "%s" section', detail_key)
    );

    if jsonb_typeof(detail_value -> 'visible') <> 'boolean' then
      raise exception 'The "%" section needs a true or false visibility', detail_key
        using errcode = '22023';
    end if;

    if jsonb_typeof(detail_value -> 'props') <> 'object' then
      raise exception 'The "%" section needs a content object', detail_key
        using errcode = '22023';
    end if;

    if detail_key = any (required_types) and (detail_value -> 'visible') <> to_jsonb(true) then
      raise exception 'The "%" section cannot be hidden', detail_key using errcode = '23514';
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(current_document -> 'sections') as stored
      where stored.value ->> 'type' = detail_key
    ) then
      raise exception 'This invitation has no editable "%" section', detail_key
        using errcode = '23514';
    end if;

    props := detail_value -> 'props';

    case detail_key
      when 'hero' then
        perform public.little_blessings_check_keys(
          props, array['eyebrow', 'title', 'subtitle', 'dateLabel', 'imageAssetId'], 'The hero'
        );
        perform public.little_blessings_check_scalar(
          props, 'eyebrow', false, 'text', 80, 'The hero label'
        );
        perform public.little_blessings_check_scalar(
          props, 'title', true, 'text', 120, 'The celebrant name'
        );
        perform public.little_blessings_check_scalar(
          props, 'subtitle', false, 'text', 240, 'The hero message'
        );
        perform public.little_blessings_check_scalar(
          props, 'dateLabel', false, 'text', 120, 'The hero date'
        );
        perform public.little_blessings_check_scalar(
          props, 'imageAssetId', false, 'uuid', 36, 'The portrait'
        );

      when 'message' then
        perform public.little_blessings_check_keys(
          props, array['heading', 'body', 'signature'], 'The message section'
        );
        perform public.little_blessings_check_scalar(
          props, 'heading', false, 'text', 120, 'The message heading'
        );
        perform public.little_blessings_check_scalar(
          props, 'body', true, 'text', 10000, 'The message'
        );

        if props -> 'signature' is not null then
          if jsonb_typeof(props -> 'signature') <> 'object' then
            raise exception 'The signature must be an object' using errcode = '22023';
          end if;

          perform public.little_blessings_check_keys(
            props -> 'signature', array['lead', 'names'], 'The signature'
          );
          perform public.little_blessings_check_scalar(
            props -> 'signature', 'lead', false, 'text', 80, 'The signature lead'
          );
          perform public.little_blessings_check_array(
            props -> 'signature', 'names', true, 1, 4, 'The signature names'
          );

          for entry in select value from jsonb_array_elements(props #> '{signature,names}') loop
            perform public.little_blessings_check_scalar(
              jsonb_build_object('name', entry), 'name', true, 'text', 120, 'A signature name'
            );
          end loop;
        end if;

      when 'countdown' then
        perform public.little_blessings_check_keys(
          props, array['heading', 'target', 'dateLabel'], 'The countdown'
        );
        perform public.little_blessings_check_scalar(
          props, 'heading', false, 'text', 120, 'The countdown heading'
        );
        perform public.little_blessings_check_scalar(
          props, 'target', true, 'timestamp', 40, 'The countdown target'
        );
        perform public.little_blessings_check_scalar(
          props, 'dateLabel', true, 'text', 120, 'The countdown date'
        );

      when 'event-details' then
        perform public.little_blessings_check_keys(
          props, array['heading', 'events'], 'Where and when'
        );
        perform public.little_blessings_check_scalar(
          props, 'heading', false, 'text', 120, 'The Where and when heading'
        );
        perform public.little_blessings_check_array(
          props, 'events', true, 1, 4, 'Where and when'
        );

        for entry in select value from jsonb_array_elements(props -> 'events') loop
          if jsonb_typeof(entry) <> 'object' then
            raise exception 'Each event must be an object' using errcode = '22023';
          end if;

          perform public.little_blessings_check_keys(
            entry,
            array[
              'label', 'startAt', 'dateLabel', 'venueName', 'address',
              'mapUrl', 'arrivalNote', 'latitude', 'longitude'
            ],
            'An event'
          );
          perform public.little_blessings_check_scalar(
            entry, 'label', true, 'text', 120, 'An event name'
          );
          perform public.little_blessings_check_scalar(
            entry, 'startAt', true, 'timestamp', 40, 'An event start time'
          );
          perform public.little_blessings_check_scalar(
            entry, 'dateLabel', true, 'text', 120, 'An event time label'
          );
          perform public.little_blessings_check_scalar(
            entry, 'venueName', true, 'text', 120, 'A venue name'
          );
          perform public.little_blessings_check_scalar(
            entry, 'address', true, 'text', 500, 'A venue address'
          );
          perform public.little_blessings_check_scalar(
            entry, 'mapUrl', false, 'url', 2048, 'A map link'
          );
          perform public.little_blessings_check_scalar(
            entry, 'arrivalNote', false, 'text', 500, 'An arrival note'
          );

          if entry -> 'latitude' is not null and (
            jsonb_typeof(entry -> 'latitude') <> 'number'
            or (entry ->> 'latitude')::numeric not between -90 and 90
          ) then
            raise exception 'A venue latitude must be between -90 and 90' using errcode = '22023';
          end if;

          if entry -> 'longitude' is not null and (
            jsonb_typeof(entry -> 'longitude') <> 'number'
            or (entry ->> 'longitude')::numeric not between -180 and 180
          ) then
            raise exception 'A venue longitude must be between -180 and 180'
              using errcode = '22023';
          end if;
        end loop;

      when 'participants' then
        perform public.little_blessings_check_keys(
          props, array['heading', 'groups'], 'The sponsors section'
        );
        perform public.little_blessings_check_scalar(
          props, 'heading', false, 'text', 120, 'The sponsors heading'
        );
        perform public.little_blessings_check_array(
          props, 'groups', true, 1, 4, 'The sponsor lists'
        );

        for entry in select value from jsonb_array_elements(props -> 'groups') loop
          if jsonb_typeof(entry) <> 'object' then
            raise exception 'Each sponsor list must be an object' using errcode = '22023';
          end if;

          perform public.little_blessings_check_keys(entry, array['label', 'names'], 'A sponsor list');
          perform public.little_blessings_check_scalar(
            entry, 'label', true, 'text', 120, 'A sponsor list name'
          );
          perform public.little_blessings_check_array(entry, 'names', true, 1, 20, 'A sponsor list');

          for nested in select value from jsonb_array_elements(entry -> 'names') loop
            perform public.little_blessings_check_scalar(
              jsonb_build_object('name', nested), 'name', true, 'text', 120, 'A sponsor name'
            );
          end loop;
        end loop;

      when 'schedule' then
        perform public.little_blessings_check_keys(
          props, array['heading', 'items'], 'The order of the day'
        );
        perform public.little_blessings_check_scalar(
          props, 'heading', false, 'text', 120, 'The order of the day heading'
        );
        perform public.little_blessings_check_array(
          props, 'items', true, 1, 12, 'The order of the day'
        );

        for entry in select value from jsonb_array_elements(props -> 'items') loop
          if jsonb_typeof(entry) <> 'object' then
            raise exception 'Each agenda entry must be an object' using errcode = '22023';
          end if;

          perform public.little_blessings_check_keys(
            entry, array['timeLabel', 'title', 'description'], 'An agenda entry'
          );
          perform public.little_blessings_check_scalar(
            entry, 'timeLabel', true, 'text', 80, 'An agenda time'
          );
          perform public.little_blessings_check_scalar(
            entry, 'title', true, 'text', 120, 'An agenda title'
          );
          perform public.little_blessings_check_scalar(
            entry, 'description', false, 'text', 500, 'An agenda description'
          );
        end loop;

      when 'attire' then
        perform public.little_blessings_check_keys(
          props, array['heading', 'description', 'colors', 'groups'], 'What to wear'
        );
        perform public.little_blessings_check_scalar(
          props, 'heading', false, 'text', 120, 'The What to wear heading'
        );
        perform public.little_blessings_check_scalar(
          props, 'description', true, 'text', 500, 'The dress code'
        );
        perform public.little_blessings_check_array(props, 'colors', false, 1, 6, 'The color palette');
        perform public.little_blessings_check_array(props, 'groups', false, 1, 4, 'The dress codes');

        for entry in select value from jsonb_array_elements(coalesce(props -> 'colors', '[]'::jsonb))
        loop
          perform public.little_blessings_check_keys(entry, array['label', 'value'], 'A color');
          perform public.little_blessings_check_scalar(
            entry, 'label', true, 'text', 80, 'A color name'
          );
          perform public.little_blessings_check_scalar(
            entry, 'value', true, 'color', 7, 'A color value'
          );
        end loop;

        for entry in select value from jsonb_array_elements(coalesce(props -> 'groups', '[]'::jsonb))
        loop
          perform public.little_blessings_check_keys(
            entry, array['label', 'description', 'colors'], 'A dress code'
          );
          perform public.little_blessings_check_scalar(
            entry, 'label', true, 'text', 120, 'A dress code audience'
          );
          perform public.little_blessings_check_scalar(
            entry, 'description', true, 'text', 500, 'A dress code'
          );
          perform public.little_blessings_check_array(
            entry, 'colors', false, 1, 6, 'A dress code palette'
          );

          for nested in select value from jsonb_array_elements(coalesce(entry -> 'colors', '[]'::jsonb))
          loop
            perform public.little_blessings_check_keys(nested, array['label', 'value'], 'A color');
            perform public.little_blessings_check_scalar(
              nested, 'label', true, 'text', 80, 'A color name'
            );
            perform public.little_blessings_check_scalar(
              nested, 'value', true, 'color', 7, 'A color value'
            );
          end loop;
        end loop;

      when 'gallery' then
        perform public.little_blessings_check_keys(
          props, array['heading', 'description', 'images'], 'Little moments'
        );
        perform public.little_blessings_check_scalar(
          props, 'heading', false, 'text', 120, 'The Little moments heading'
        );
        perform public.little_blessings_check_scalar(
          props, 'description', false, 'text', 500, 'The Little moments introduction'
        );
        perform public.little_blessings_check_array(props, 'images', true, 1, 8, 'Little moments');

        for entry in select value from jsonb_array_elements(props -> 'images') loop
          if jsonb_typeof(entry) <> 'object' then
            raise exception 'Each photograph must be an object' using errcode = '22023';
          end if;

          perform public.little_blessings_check_keys(
            entry, array['assetId', 'title', 'caption'], 'A photograph'
          );
          perform public.little_blessings_check_scalar(
            entry, 'assetId', true, 'uuid', 36, 'A photograph'
          );
          perform public.little_blessings_check_scalar(
            entry, 'title', false, 'text', 240, 'A photograph title'
          );
          perform public.little_blessings_check_scalar(
            entry, 'caption', false, 'text', 240, 'A photograph description'
          );
        end loop;

      when 'guidance' then
        perform public.little_blessings_check_keys(
          props, array['heading', 'items'], 'The gentle note'
        );
        perform public.little_blessings_check_scalar(
          props, 'heading', false, 'text', 120, 'The gentle note heading'
        );
        perform public.little_blessings_check_array(props, 'items', true, 1, 8, 'The gentle note');

        for entry in select value from jsonb_array_elements(props -> 'items') loop
          perform public.little_blessings_check_scalar(
            jsonb_build_object('item', entry), 'item', true, 'text', 500, 'A gentle note'
          );
        end loop;

      when 'gifts' then
        perform public.little_blessings_check_keys(
          props, array['heading', 'message', 'items'], 'Gift ideas'
        );
        perform public.little_blessings_check_scalar(
          props, 'heading', false, 'text', 120, 'The Gift ideas heading'
        );
        perform public.little_blessings_check_scalar(
          props, 'message', false, 'text', 500, 'The Gift ideas introduction'
        );
        perform public.little_blessings_check_array(props, 'items', true, 1, 8, 'Gift ideas');

        for entry in select value from jsonb_array_elements(props -> 'items') loop
          if jsonb_typeof(entry) <> 'object' then
            raise exception 'Each gift idea must be an object' using errcode = '22023';
          end if;

          perform public.little_blessings_check_keys(
            entry, array['imageAssetId', 'name', 'note'], 'A gift idea'
          );
          perform public.little_blessings_check_scalar(
            entry, 'imageAssetId', false, 'uuid', 36, 'A gift picture'
          );
          perform public.little_blessings_check_scalar(
            entry, 'name', true, 'text', 120, 'A gift idea'
          );
          perform public.little_blessings_check_scalar(
            entry, 'note', false, 'text', 240, 'A gift note'
          );
        end loop;

      when 'rsvp' then
        perform public.little_blessings_check_keys(
          props, array['heading', 'message', 'deadline'], 'The reply section'
        );
        perform public.little_blessings_check_scalar(
          props, 'heading', false, 'text', 120, 'The reply heading'
        );
        perform public.little_blessings_check_scalar(
          props, 'message', false, 'text', 500, 'The reply message'
        );
        perform public.little_blessings_check_scalar(
          props, 'deadline', false, 'timestamp', 40, 'The reply deadline'
        );
    end case;
  end loop;

  select jsonb_agg(
    case
      when p_details ? (stored.value ->> 'type')
        then stored.value
          || jsonb_build_object(
               'visible', p_details -> (stored.value ->> 'type') -> 'visible',
               'props', p_details -> (stored.value ->> 'type') -> 'props'
             )
      else stored.value
    end
    order by stored.ordinality
  )
  into updated_sections
  from jsonb_array_elements(current_document -> 'sections')
    with ordinality as stored(value, ordinality);

  -- Referenced images decide the document asset list. Collecting them from the
  -- rebuilt sections keeps `assets` consistent with the content in one place:
  -- a removed photograph drops its asset, and a newly uploaded one is declared
  -- without the caller having to maintain a parallel list it could get wrong.
  for section in select value from jsonb_array_elements(updated_sections) loop
    if section ->> 'type' = 'hero' and section #> '{props,imageAssetId}' is not null then
      image_ids := image_ids || (section #>> '{props,imageAssetId}')::uuid;
    elsif section ->> 'type' = 'gallery' then
      for entry in select value from jsonb_array_elements(section #> '{props,images}') loop
        image_ids := image_ids || (entry ->> 'assetId')::uuid;
      end loop;
    elsif section ->> 'type' = 'gifts' then
      for entry in select value from jsonb_array_elements(section #> '{props,items}') loop
        if entry -> 'imageAssetId' is not null then
          image_ids := image_ids || (entry ->> 'imageAssetId')::uuid;
        end if;
      end loop;
    end if;
  end loop;

  select coalesce(jsonb_agg(kept.value order by kept.ordinality), '[]'::jsonb)
  into retained_assets
  from jsonb_array_elements(current_document -> 'assets')
    with ordinality as kept(value, ordinality)
  where kept.value ->> 'kind' <> 'image';

  select coalesce(
    jsonb_agg(jsonb_build_object('id', unique_ids.id, 'kind', 'image') order by unique_ids.ordinal),
    '[]'::jsonb
  )
  into image_assets
  from (
    select referenced.id, min(referenced.ordinal) as ordinal
    from unnest(image_ids) with ordinality as referenced(id, ordinal)
    group by referenced.id
  ) as unique_ids;

  if jsonb_array_length(retained_assets) + jsonb_array_length(image_assets) > 100 then
    raise exception 'This invitation references too many assets' using errcode = '22023';
  end if;

  updated_document := jsonb_set(current_document, '{sections}', updated_sections, false);
  updated_document := jsonb_set(
    updated_document, '{assets}', retained_assets || image_assets, false
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

revoke all on function public.little_blessings_check_scalar(jsonb, text, boolean, text, integer, text)
from public, anon, authenticated, service_role;
revoke all on function public.little_blessings_check_keys(jsonb, text[], text)
from public, anon, authenticated, service_role;
revoke all on function public.little_blessings_check_array(jsonb, text, boolean, integer, integer, text)
from public, anon, authenticated, service_role;

revoke all on function public.update_little_blessings_details(uuid, bigint, jsonb)
from public, anon, service_role;
grant execute on function public.update_little_blessings_details(uuid, bigint, jsonb)
to authenticated;

commit;
