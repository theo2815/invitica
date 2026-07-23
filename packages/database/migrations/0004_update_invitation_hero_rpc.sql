begin;

create or replace function public.update_invitation_hero(
  p_invitation_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_subtitle text,
  p_date_label text
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
  updated_hero jsonb;
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

  select (section.ordinality - 1)::integer, section.value
  into hero_index, updated_hero
  from jsonb_array_elements(current_document -> 'sections')
    with ordinality as section(value, ordinality)
  where section.value ->> 'type' = 'hero'
  limit 1;

  if not found then
    raise exception 'Invitation document has no editable hero section' using errcode = '23514';
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

  updated_document := jsonb_set(
    current_document,
    array['sections', hero_index::text],
    updated_hero,
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

revoke update (document, revision) on table public.invitation_drafts from authenticated;

revoke all on function public.update_invitation_hero(uuid, bigint, text, text, text)
from public, anon;
grant execute on function public.update_invitation_hero(uuid, bigint, text, text, text)
to authenticated;

commit;
