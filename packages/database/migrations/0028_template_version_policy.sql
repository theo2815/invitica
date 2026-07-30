begin;

-- The repository manifest describes a template to the product. This table is
-- the independent database authorization boundary for saves and publication:
-- one reviewed row admits one immutable production template version.
create table public.template_version_policies (
  template_version_id uuid primary key,
  template_id text not null,
  template_version integer not null,
  invitation_schema_version integer not null,
  renderer_key text not null,
  renderer_version integer not null,
  editor_key text not null,
  allowed_section_types text[] not null,
  editable_section_types text[] not null,
  visibility_editable_section_types text[] not null default '{}',
  required_visible_section_types text[] not null default '{}',
  constraint template_version_policies_template_version_positive
    check (template_version > 0),
  constraint template_version_policies_schema_version_positive
    check (invitation_schema_version > 0),
  constraint template_version_policies_renderer_version_positive
    check (renderer_version > 0),
  constraint template_version_policies_template_id_format
    check (template_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint template_version_policies_renderer_key_format
    check (renderer_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint template_version_policies_editor_key_format
    check (editor_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint template_version_policies_sections_present
    check (
      cardinality(allowed_section_types) between 1 and 30
      and cardinality(editable_section_types) between 1 and 30
    ),
  constraint template_version_policies_editable_allowed
    check (editable_section_types <@ allowed_section_types),
  constraint template_version_policies_visibility_editable
    check (visibility_editable_section_types <@ editable_section_types),
  constraint template_version_policies_required_allowed
    check (required_visible_section_types <@ allowed_section_types),
  constraint template_version_policies_version_unique
    unique (template_id, template_version)
);

alter table public.template_version_policies enable row level security;
revoke all on table public.template_version_policies
from public, anon, authenticated, service_role;

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
values
  (
    '40000000-0000-4000-8000-000000000001',
    'garden-promise',
    1,
    1,
    'garden-promise-v1',
    1,
    'focused-event-v1',
    array['hero', 'message', 'venue', 'rsvp'],
    array['hero', 'venue', 'rsvp'],
    '{}',
    array['hero', 'venue']
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    'little-blessings',
    1,
    1,
    'little-blessings-v1',
    1,
    'section-document-v1',
    array[
      'hero', 'message', 'countdown', 'event-details', 'participants',
      'schedule', 'attire', 'gallery', 'guidance', 'gifts', 'rsvp'
    ],
    array[
      'hero', 'message', 'countdown', 'event-details', 'participants',
      'schedule', 'attire', 'gallery', 'guidance', 'gifts', 'rsvp'
    ],
    array[
      'message', 'countdown', 'participants', 'schedule', 'attire',
      'gallery', 'guidance', 'gifts', 'rsvp'
    ],
    array['hero', 'event-details']
  ),
  (
    '40000000-0000-4000-8000-000000000005',
    'little-blessings',
    2,
    1,
    'little-blessings-v2',
    2,
    'section-document-v1',
    array[
      'hero', 'message', 'countdown', 'event-details', 'participants',
      'schedule', 'attire', 'gallery', 'guidance', 'gifts', 'rsvp'
    ],
    array[
      'hero', 'message', 'countdown', 'event-details', 'participants',
      'schedule', 'attire', 'gallery', 'guidance', 'gifts', 'rsvp'
    ],
    array[
      'message', 'countdown', 'participants', 'schedule', 'attire',
      'gallery', 'guidance', 'gifts', 'rsvp'
    ],
    array['hero', 'event-details']
  );

-- Private helpers mirror the strict invitation schema's scalar and collection
-- bounds. They are deliberately not executable by client roles.
create function public.invitation_check_scalar(
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
      raise exception '% is required', p_label using errcode = '22023';
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
    when 'text' then null;
    when 'uuid' then
      if raw_value !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception '% must be an identifier', p_label using errcode = '22023';
      end if;
    when 'timestamp' then
      if raw_value !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
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
    else
      raise exception 'Unknown scalar validator' using errcode = '22023';
  end case;
end;
$$;

create function public.invitation_check_keys(
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

create function public.invitation_check_array(
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
      p_label, p_min_length, p_max_length using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.invitation_check_scalar(jsonb, text, boolean, text, integer, text)
from public, anon, authenticated, service_role;
revoke all on function public.invitation_check_keys(jsonb, text[], text)
from public, anon, authenticated, service_role;
revoke all on function public.invitation_check_array(
  jsonb, text, boolean, integer, integer, text
) from public, anon, authenticated, service_role;

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
  entry jsonb;
  nested jsonb;
begin
  if p_section_type is null
    or p_visible is null
    or p_props is null
    or jsonb_typeof(p_props) <> 'object' then
    raise exception 'An invitation section is invalid' using errcode = '22023';
  end if;

  case p_section_type
    when 'hero' then
      perform public.invitation_check_keys(
        p_props, array['eyebrow', 'title', 'subtitle', 'dateLabel', 'imageAssetId'], 'The hero'
      );
      perform public.invitation_check_scalar(
        p_props, 'eyebrow', false, 'text', 80, 'The hero label'
      );
      perform public.invitation_check_scalar(
        p_props, 'title', true, 'text', 120, 'The celebrant name'
      );
      perform public.invitation_check_scalar(
        p_props, 'subtitle', false, 'text', 240, 'The hero message'
      );
      perform public.invitation_check_scalar(
        p_props, 'dateLabel', false, 'text', 120, 'The hero date'
      );
      perform public.invitation_check_scalar(
        p_props, 'imageAssetId', false, 'uuid', 36, 'The portrait'
      );

    when 'message' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'body', 'signature'], 'The message section'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The message heading'
      );
      perform public.invitation_check_scalar(
        p_props, 'body', true, 'text', 10000, 'The message'
      );

      if p_props -> 'signature' is not null then
        if jsonb_typeof(p_props -> 'signature') <> 'object' then
          raise exception 'The signature must be an object' using errcode = '22023';
        end if;
        perform public.invitation_check_keys(
          p_props -> 'signature', array['lead', 'names'], 'The signature'
        );
        perform public.invitation_check_scalar(
          p_props -> 'signature', 'lead', false, 'text', 80, 'The signature lead'
        );
        perform public.invitation_check_array(
          p_props -> 'signature', 'names', true, 1, 4, 'The signature names'
        );
        for entry in select value from jsonb_array_elements(p_props #> '{signature,names}') loop
          perform public.invitation_check_scalar(
            jsonb_build_object('name', entry), 'name', true, 'text', 120, 'A signature name'
          );
        end loop;
      end if;

    when 'venue' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'venueName', 'address', 'mapUrl'], 'The venue'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The venue heading'
      );
      perform public.invitation_check_scalar(
        p_props, 'venueName', true, 'text', 120, 'The venue name'
      );
      perform public.invitation_check_scalar(
        p_props, 'address', true, 'text', 500, 'The venue address'
      );
      perform public.invitation_check_scalar(
        p_props, 'mapUrl', false, 'url', 2048, 'The venue map link'
      );

    when 'rsvp' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'message', 'deadline'], 'The reply section'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The reply heading'
      );
      perform public.invitation_check_scalar(
        p_props, 'message', false, 'text', 500, 'The reply message'
      );
      perform public.invitation_check_scalar(
        p_props, 'deadline', false, 'timestamp', 40, 'The reply deadline'
      );

    when 'countdown' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'target', 'dateLabel'], 'The countdown'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The countdown heading'
      );
      perform public.invitation_check_scalar(
        p_props, 'target', true, 'timestamp', 40, 'The countdown target'
      );
      perform public.invitation_check_scalar(
        p_props, 'dateLabel', true, 'text', 120, 'The countdown date'
      );

    when 'event-details' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'events'], 'Where and when'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The Where and when heading'
      );
      perform public.invitation_check_array(
        p_props, 'events', true, 1, 4, 'Where and when'
      );

      for entry in select value from jsonb_array_elements(p_props -> 'events') loop
        if jsonb_typeof(entry) <> 'object' then
          raise exception 'Each event must be an object' using errcode = '22023';
        end if;
        perform public.invitation_check_keys(
          entry,
          array[
            'label', 'startAt', 'dateLabel', 'venueName', 'address',
            'mapUrl', 'arrivalNote', 'latitude', 'longitude'
          ],
          'An event'
        );
        perform public.invitation_check_scalar(
          entry, 'label', true, 'text', 120, 'An event name'
        );
        perform public.invitation_check_scalar(
          entry, 'startAt', true, 'timestamp', 40, 'An event start time'
        );
        perform public.invitation_check_scalar(
          entry, 'dateLabel', true, 'text', 120, 'An event time label'
        );
        perform public.invitation_check_scalar(
          entry, 'venueName', true, 'text', 120, 'A venue name'
        );
        perform public.invitation_check_scalar(
          entry, 'address', true, 'text', 500, 'A venue address'
        );
        perform public.invitation_check_scalar(
          entry, 'mapUrl', false, 'url', 2048, 'A map link'
        );
        perform public.invitation_check_scalar(
          entry, 'arrivalNote', false, 'text', 500, 'An arrival note'
        );

        if entry -> 'latitude' is not null then
          if jsonb_typeof(entry -> 'latitude') <> 'number'
            or (entry ->> 'latitude')::numeric not between -90 and 90 then
            raise exception 'A venue latitude must be between -90 and 90'
              using errcode = '22023';
          end if;
        end if;
        if entry -> 'longitude' is not null then
          if jsonb_typeof(entry -> 'longitude') <> 'number'
            or (entry ->> 'longitude')::numeric not between -180 and 180 then
            raise exception 'A venue longitude must be between -180 and 180'
              using errcode = '22023';
          end if;
        end if;
      end loop;

    when 'participants' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'groups'], 'The participants section'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The participants heading'
      );
      perform public.invitation_check_array(
        p_props, 'groups', true, 1, 4, 'The participant lists'
      );
      for entry in select value from jsonb_array_elements(p_props -> 'groups') loop
        if jsonb_typeof(entry) <> 'object' then
          raise exception 'Each participant list must be an object' using errcode = '22023';
        end if;
        perform public.invitation_check_keys(
          entry, array['label', 'names'], 'A participant list'
        );
        perform public.invitation_check_scalar(
          entry, 'label', true, 'text', 120, 'A participant list name'
        );
        perform public.invitation_check_array(
          entry, 'names', true, 1, 20, 'A participant list'
        );
        for nested in select value from jsonb_array_elements(entry -> 'names') loop
          perform public.invitation_check_scalar(
            jsonb_build_object('name', nested), 'name', true, 'text', 120, 'A participant name'
          );
        end loop;
      end loop;

    when 'schedule' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'items'], 'The order of the day'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The order of the day heading'
      );
      perform public.invitation_check_array(
        p_props, 'items', true, 1, 12, 'The order of the day'
      );
      for entry in select value from jsonb_array_elements(p_props -> 'items') loop
        if jsonb_typeof(entry) <> 'object' then
          raise exception 'Each agenda entry must be an object' using errcode = '22023';
        end if;
        perform public.invitation_check_keys(
          entry, array['timeLabel', 'title', 'description'], 'An agenda entry'
        );
        perform public.invitation_check_scalar(
          entry, 'timeLabel', true, 'text', 80, 'An agenda time'
        );
        perform public.invitation_check_scalar(
          entry, 'title', true, 'text', 120, 'An agenda title'
        );
        perform public.invitation_check_scalar(
          entry, 'description', false, 'text', 500, 'An agenda description'
        );
      end loop;

    when 'attire' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'description', 'colors', 'groups'], 'What to wear'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The What to wear heading'
      );
      perform public.invitation_check_scalar(
        p_props, 'description', true, 'text', 500, 'The dress code'
      );
      perform public.invitation_check_array(
        p_props, 'colors', false, 1, 6, 'The color palette'
      );
      perform public.invitation_check_array(
        p_props, 'groups', false, 1, 4, 'The dress codes'
      );

      for entry in
        select value from jsonb_array_elements(coalesce(p_props -> 'colors', '[]'::jsonb))
      loop
        if jsonb_typeof(entry) <> 'object' then
          raise exception 'Each color must be an object' using errcode = '22023';
        end if;
        perform public.invitation_check_keys(entry, array['label', 'value'], 'A color');
        perform public.invitation_check_scalar(
          entry, 'label', true, 'text', 80, 'A color name'
        );
        perform public.invitation_check_scalar(
          entry, 'value', true, 'color', 7, 'A color value'
        );
      end loop;

      for entry in
        select value from jsonb_array_elements(coalesce(p_props -> 'groups', '[]'::jsonb))
      loop
        if jsonb_typeof(entry) <> 'object' then
          raise exception 'Each dress code must be an object' using errcode = '22023';
        end if;
        perform public.invitation_check_keys(
          entry, array['label', 'description', 'colors'], 'A dress code'
        );
        perform public.invitation_check_scalar(
          entry, 'label', true, 'text', 120, 'A dress code audience'
        );
        perform public.invitation_check_scalar(
          entry, 'description', true, 'text', 500, 'A dress code'
        );
        perform public.invitation_check_array(
          entry, 'colors', false, 1, 6, 'A dress code palette'
        );
        for nested in
          select value from jsonb_array_elements(coalesce(entry -> 'colors', '[]'::jsonb))
        loop
          if jsonb_typeof(nested) <> 'object' then
            raise exception 'Each color must be an object' using errcode = '22023';
          end if;
          perform public.invitation_check_keys(nested, array['label', 'value'], 'A color');
          perform public.invitation_check_scalar(
            nested, 'label', true, 'text', 80, 'A color name'
          );
          perform public.invitation_check_scalar(
            nested, 'value', true, 'color', 7, 'A color value'
          );
        end loop;
      end loop;

    when 'gallery' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'description', 'images'], 'The gallery'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The gallery heading'
      );
      perform public.invitation_check_scalar(
        p_props, 'description', false, 'text', 500, 'The gallery introduction'
      );
      perform public.invitation_check_array(p_props, 'images', true, 0, 8, 'The gallery');
      if p_visible and jsonb_array_length(p_props -> 'images') = 0 then
        raise exception 'A gallery needs a photograph before guests can see it'
          using errcode = '22023';
      end if;
      for entry in select value from jsonb_array_elements(p_props -> 'images') loop
        if jsonb_typeof(entry) <> 'object' then
          raise exception 'Each photograph must be an object' using errcode = '22023';
        end if;
        perform public.invitation_check_keys(
          entry, array['assetId', 'title', 'caption'], 'A photograph'
        );
        perform public.invitation_check_scalar(
          entry, 'assetId', true, 'uuid', 36, 'A photograph'
        );
        perform public.invitation_check_scalar(
          entry, 'title', false, 'text', 240, 'A photograph title'
        );
        perform public.invitation_check_scalar(
          entry, 'caption', false, 'text', 240, 'A photograph description'
        );
      end loop;

    when 'guidance' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'items'], 'The guidance section'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The guidance heading'
      );
      perform public.invitation_check_array(
        p_props, 'items', true, 1, 8, 'The guidance section'
      );
      for entry in select value from jsonb_array_elements(p_props -> 'items') loop
        perform public.invitation_check_scalar(
          jsonb_build_object('item', entry), 'item', true, 'text', 500, 'A guidance item'
        );
      end loop;

    when 'gifts' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'message', 'items'], 'The gifts section'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The gifts heading'
      );
      perform public.invitation_check_scalar(
        p_props, 'message', false, 'text', 500, 'The gifts introduction'
      );
      perform public.invitation_check_array(p_props, 'items', true, 1, 8, 'Gift ideas');
      for entry in select value from jsonb_array_elements(p_props -> 'items') loop
        if jsonb_typeof(entry) <> 'object' then
          raise exception 'Each gift idea must be an object' using errcode = '22023';
        end if;
        perform public.invitation_check_keys(
          entry, array['imageAssetId', 'name', 'note'], 'A gift idea'
        );
        perform public.invitation_check_scalar(
          entry, 'imageAssetId', false, 'uuid', 36, 'A gift picture'
        );
        perform public.invitation_check_scalar(
          entry, 'name', true, 'text', 120, 'A gift idea'
        );
        perform public.invitation_check_scalar(
          entry, 'note', false, 'text', 240, 'A gift note'
        );
      end loop;

    else
      raise exception 'The "%" section is not supported', p_section_type using errcode = '22023';
  end case;
end;
$$;

revoke all on function public.invitation_validate_section(text, boolean, jsonb)
from public, anon, authenticated, service_role;

create function public.update_invitation_sections(
  p_invitation_id uuid,
  p_expected_revision bigint,
  p_section_updates jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_workspace_id uuid;
  current_template_version_id uuid;
  current_document jsonb;
  current_revision bigint;
  template_policy public.template_version_policies%rowtype;
  section_update jsonb;
  section_id text;
  section_type text;
  stored_section jsonb;
  stored_index integer;
  updated_sections jsonb;
  updated_document jsonb;
  updated_ids text[] := '{}';
  image_ids uuid[] := '{}';
  retained_assets jsonb;
  image_assets jsonb;
  section jsonb;
  entry jsonb;
  saved_revision bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_invitation_id is null
    or p_expected_revision is null
    or p_expected_revision < 1
    or p_section_updates is null
    or jsonb_typeof(p_section_updates) <> 'array'
    or jsonb_array_length(p_section_updates) not between 1 and 30 then
    raise exception 'Invalid invitation section update' using errcode = '22023';
  end if;

  select
    invitation_drafts.workspace_id,
    invitation_drafts.template_version_id,
    invitation_drafts.document,
    invitation_drafts.revision
  into
    current_workspace_id,
    current_template_version_id,
    current_document,
    current_revision
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

  select *
  into template_policy
  from public.template_version_policies
  where template_version_id = current_template_version_id;

  if not found then
    raise exception 'This template version is not editable' using errcode = '23514';
  end if;

  if current_document ->> 'templateVersionId' <> current_template_version_id::text
    or current_document ->> 'schemaVersion'
      <> template_policy.invitation_schema_version::text
    or jsonb_typeof(current_document -> 'sections') <> 'array'
    or jsonb_typeof(current_document -> 'assets') <> 'array'
    or jsonb_array_length(current_document -> 'sections') not between 1 and 30 then
    raise exception 'The stored invitation does not match its template policy'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(current_document -> 'sections') as stored(value)
    where jsonb_typeof(stored.value) <> 'object'
      or stored.value ->> 'type' is null
      or not (
        stored.value ->> 'type' = any (template_policy.allowed_section_types)
      )
  ) then
    raise exception 'The stored invitation contains a section outside its template policy'
      using errcode = '23514';
  end if;

  updated_sections := current_document -> 'sections';

  for section_update in select value from jsonb_array_elements(p_section_updates) loop
    if jsonb_typeof(section_update) <> 'object' then
      raise exception 'Each section update must be an object' using errcode = '22023';
    end if;

    perform public.invitation_check_keys(
      section_update, array['id', 'visible', 'props'], 'A section update'
    );
    perform public.invitation_check_scalar(
      section_update, 'id', true, 'uuid', 36, 'The section identifier'
    );
    if jsonb_typeof(section_update -> 'visible') <> 'boolean'
      or jsonb_typeof(section_update -> 'props') <> 'object' then
      raise exception 'A section update needs visibility and content'
        using errcode = '22023';
    end if;

    section_id := section_update ->> 'id';
    if section_id = any (updated_ids) then
      raise exception 'A section may be updated only once' using errcode = '22023';
    end if;
    updated_ids := updated_ids || section_id;

    select (stored.ordinality - 1)::integer, stored.value
    into stored_index, stored_section
    from jsonb_array_elements(updated_sections)
      with ordinality as stored(value, ordinality)
    where stored.value ->> 'id' = section_id
    limit 1;

    if not found then
      raise exception 'The section is not part of this invitation' using errcode = '23514';
    end if;

    section_type := stored_section ->> 'type';
    if not (section_type = any (template_policy.editable_section_types)) then
      raise exception 'The "%" section is not editable for this template', section_type
        using errcode = '23514';
    end if;

    if section_update -> 'visible' <> stored_section -> 'visible'
      and not (
        section_type = any (template_policy.visibility_editable_section_types)
      ) then
      raise exception 'The "%" section visibility is fixed for this template', section_type
        using errcode = '23514';
    end if;

    if section_type = any (template_policy.required_visible_section_types)
      and section_update -> 'visible' <> to_jsonb(true) then
      raise exception 'The "%" section cannot be hidden', section_type using errcode = '23514';
    end if;

    perform public.invitation_validate_section(
      section_type,
      (section_update ->> 'visible')::boolean,
      section_update -> 'props'
    );

    stored_section := stored_section || jsonb_build_object(
      'visible', section_update -> 'visible',
      'props', section_update -> 'props'
    );
    updated_sections := jsonb_set(
      updated_sections,
      array[stored_index::text],
      stored_section,
      false
    );
  end loop;

  -- Rebuild image declarations from every resulting section. This keeps the
  -- parallel asset list synchronized without letting the caller write it.
  for section in select value from jsonb_array_elements(updated_sections) loop
    if section ->> 'type' = 'hero' and section #> '{props,imageAssetId}' is not null then
      image_ids := image_ids || (section #>> '{props,imageAssetId}')::uuid;
    elsif section ->> 'type' = 'gallery' then
      for entry in
        select value from jsonb_array_elements(coalesce(section #> '{props,images}', '[]'::jsonb))
      loop
        image_ids := image_ids || (entry ->> 'assetId')::uuid;
      end loop;
    elsif section ->> 'type' = 'gifts' then
      for entry in
        select value from jsonb_array_elements(coalesce(section #> '{props,items}', '[]'::jsonb))
      loop
        if entry -> 'imageAssetId' is not null then
          image_ids := image_ids || (entry ->> 'imageAssetId')::uuid;
        end if;
      end loop;
    end if;
  end loop;

  if exists (
    select 1
    from (select distinct referenced.id from unnest(image_ids) as referenced(id)) as required
    where not exists (
      select 1
      from public.invitation_media_assets
      where invitation_media_assets.id = required.id
        and invitation_media_assets.workspace_id = current_workspace_id
        and invitation_media_assets.invitation_id = p_invitation_id
        and invitation_media_assets.status = 'ready'
        and invitation_media_assets.deleted_at is null
    )
  ) then
    raise exception 'An invitation image is not available for this draft'
      using errcode = '23514';
  end if;

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

revoke all on function public.update_invitation_sections(uuid, bigint, jsonb)
from public, anon, service_role;
grant execute on function public.update_invitation_sections(uuid, bigint, jsonb)
to authenticated;

-- Keep the public retry/idempotency wrapper from 0006. Replace only its private
-- inner mutation so publication authorization reads the same exact policy rows
-- as generic saving instead of another copied values list.
create or replace function public.request_invitation_publication_v0005(
  p_invitation_id uuid,
  p_expected_draft_revision bigint,
  p_idempotency_key uuid,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_workspace_id uuid;
  current_template_version_id uuid;
  current_draft_revision bigint;
  current_document jsonb;
  template_policy public.template_version_policies%rowtype;
  existing_publication record;
  next_publication_number bigint;
  created_publication_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_invitation_id is null
    or p_idempotency_key is null
    or p_expected_draft_revision is null
    or p_expected_draft_revision < 1
    or p_snapshot is null
    or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Invalid publication request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );

  select
    invitation_drafts.workspace_id,
    invitation_drafts.template_version_id,
    invitation_drafts.revision,
    invitation_drafts.document
  into
    current_workspace_id,
    current_template_version_id,
    current_draft_revision,
    current_document
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

  select
    publication_versions.id,
    publication_versions.invitation_id,
    publication_versions.draft_revision,
    publication_versions.snapshot
  into existing_publication
  from public.publication_versions
  where publication_versions.workspace_id = current_workspace_id
    and publication_versions.idempotency_key = p_idempotency_key;

  if found then
    if existing_publication.invitation_id <> p_invitation_id
      or existing_publication.draft_revision <> p_expected_draft_revision
      or existing_publication.snapshot <> p_snapshot then
      raise exception 'Publication idempotency key was reused with different input'
        using errcode = '22023';
    end if;

    return existing_publication.id;
  end if;

  if current_draft_revision <> p_expected_draft_revision then
    raise exception 'Invitation draft revision conflict' using errcode = '40001';
  end if;

  select *
  into template_policy
  from public.template_version_policies
  where template_version_id = current_template_version_id;

  if not found
    or template_policy.renderer_key <> p_snapshot ->> 'rendererKey'
    or template_policy.template_version::text <> p_snapshot ->> 'templateVersion'
    or template_policy.renderer_version::text <> p_snapshot ->> 'rendererVersion'
    or template_policy.invitation_schema_version::text
      <> p_snapshot ->> 'invitationSchemaVersion' then
    raise exception 'Publication snapshot does not match the supported draft contract'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(current_document -> 'sections') as stored(value)
    where not (
      stored.value ->> 'type' = any (template_policy.allowed_section_types)
    )
  ) then
    raise exception 'Publication snapshot does not match the supported draft contract'
      using errcode = '22023';
  end if;

  if p_snapshot ->> 'snapshotVersion' <> '1'
    or p_snapshot ->> 'templateVersionId' <> current_template_version_id::text
    or p_snapshot ->> 'draftRevision' <> current_draft_revision::text
    or p_snapshot -> 'document' <> current_document
    or not public.publication_assets_are_valid(current_document, p_snapshot -> 'assets') then
    raise exception 'Publication snapshot does not match the supported draft contract'
      using errcode = '22023';
  end if;

  select coalesce(max(publication_versions.publication_number), 0) + 1
  into next_publication_number
  from public.publication_versions
  where publication_versions.invitation_id = p_invitation_id;

  insert into public.publication_versions (
    workspace_id,
    invitation_id,
    publication_number,
    idempotency_key,
    snapshot_version,
    invitation_schema_version,
    renderer_key,
    renderer_version,
    template_version_id,
    template_version,
    draft_revision,
    snapshot
  )
  values (
    current_workspace_id,
    p_invitation_id,
    next_publication_number,
    p_idempotency_key,
    1,
    template_policy.invitation_schema_version,
    template_policy.renderer_key,
    template_policy.renderer_version,
    current_template_version_id,
    template_policy.template_version,
    current_draft_revision,
    p_snapshot
  )
  returning id into created_publication_id;

  insert into public.publication_builds (
    publication_id,
    workspace_id,
    invitation_id
  )
  values (
    created_publication_id,
    current_workspace_id,
    p_invitation_id
  );

  insert into public.publication_aliases (workspace_id, invitation_id)
  values (current_workspace_id, p_invitation_id)
  on conflict (invitation_id) do nothing;

  return created_publication_id;
end;
$$;

revoke all on function public.request_invitation_publication_v0005(uuid, bigint, uuid, jsonb)
from public, anon, authenticated, service_role;

commit;
