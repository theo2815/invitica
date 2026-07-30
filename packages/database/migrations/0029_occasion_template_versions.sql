begin;

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
    '40000000-0000-4000-8000-000000000006',
    'garden-promise',
    2,
    1,
    'garden-promise-v2',
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
  ),
  (
    '40000000-0000-4000-8000-000000000007',
    'golden-hour',
    2,
    1,
    'golden-hour-v2',
    2,
    'section-document-v1',
    array[
      'hero', 'message', 'countdown', 'event-details', 'participants',
      'schedule', 'attire', 'gallery', 'guidance', 'rsvp'
    ],
    array[
      'hero', 'message', 'countdown', 'event-details', 'participants',
      'schedule', 'attire', 'gallery', 'guidance', 'rsvp'
    ],
    array[
      'message', 'countdown', 'participants', 'schedule', 'attire',
      'gallery', 'guidance', 'rsvp'
    ],
    array['hero', 'event-details']
  ),
  (
    '40000000-0000-4000-8000-000000000008',
    'sunday-joy',
    2,
    1,
    'sunday-joy-v2',
    2,
    'section-document-v1',
    array[
      'hero', 'message', 'countdown', 'event-details', 'schedule',
      'attire', 'gallery', 'guidance', 'gifts', 'rsvp'
    ],
    array[
      'hero', 'message', 'countdown', 'event-details', 'schedule',
      'attire', 'gallery', 'guidance', 'gifts', 'rsvp'
    ],
    array[
      'message', 'countdown', 'schedule', 'attire', 'gallery',
      'guidance', 'gifts', 'rsvp'
    ],
    array['hero', 'event-details']
  );

-- Keep the reviewed v0028 validator as the authority for unchanged section
-- types. The replacement only widens the two approved collection limits.
alter function public.invitation_validate_section(text, boolean, jsonb)
rename to invitation_validate_section_v0028;

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
    when 'participants' then
      perform public.invitation_check_keys(
        p_props, array['heading', 'groups'], 'The participants section'
      );
      perform public.invitation_check_scalar(
        p_props, 'heading', false, 'text', 120, 'The participants heading'
      );
      perform public.invitation_check_array(
        p_props, 'groups', true, 1, 10, 'The participant lists'
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
        p_props, 'items', true, 1, 16, 'The order of the day'
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

    else
      perform public.invitation_validate_section_v0028(
        p_section_type,
        p_visible,
        p_props
      );
  end case;
end;
$$;

revoke all on function public.invitation_validate_section_v0028(text, boolean, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.invitation_validate_section(text, boolean, jsonb)
from public, anon, authenticated, service_role;

commit;
