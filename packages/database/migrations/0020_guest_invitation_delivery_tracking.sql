begin;

-- Guest invitation delivery tracking.
--
-- A creator sending fifty invitations by hand through Messenger or Viber has no way to
-- remember who already received one, and a duplicate message reads as careless. This
-- adds the smallest durable record that answers "have I sent this party their
-- invitation?".
--
-- Two deliberate boundaries:
--
-- * **Marking as sent is a creator statement, not an inference.** Copying an invitation
--   is evidence of intent, never of delivery — a creator may copy and then never paste.
--   The two are recorded separately and never collapsed.
-- * **Nothing here observes a guest.** No open, read, click, device, or IP is recorded.
--   Guest-side view measurement remains aggregate-only in `invitation_view_daily`
--   (`0010`) and is untouched by this migration.
--
-- Counters live on `guest_parties` rather than in an append-only event table: a party is
-- hard-bounded at fifty per invitation, the Guest Desk needs current state on every
-- render, and denormalised columns keep that a plain select with no join or aggregate.
-- An event log remains a later option if a full audit trail is ever wanted.

alter table public.guest_parties
  add column copy_count integer not null default 0,
  add column first_copied_at timestamptz,
  add column last_copied_at timestamptz,
  add column marked_sent_at timestamptz;

alter table public.guest_parties
  add constraint guest_parties_copy_count_nonnegative check (copy_count >= 0),
  -- A copy count and its timestamps can only be present together.
  add constraint guest_parties_copy_timestamps_consistent check (
    (copy_count = 0 and first_copied_at is null and last_copied_at is null)
    or (copy_count > 0 and first_copied_at is not null and last_copied_at is not null)
  ),
  add constraint guest_parties_copy_order_sane check (
    first_copied_at is null or last_copied_at >= first_copied_at
  );

-- `0012` replaced table-wide select on `guest_parties` with an explicit column allowlist,
-- and a column added later inherits nothing from it. Without these grants the Guest Desk
-- could not read back the very state it just wrote — the creator would see every party as
-- never copied and never sent. Caught by this migration's runtime pgTAP suite; a
-- catalog-only suite would have passed.
grant select (
  copy_count,
  first_copied_at,
  last_copied_at,
  marked_sent_at
) on table public.guest_parties to authenticated;

-- Records that the creator copied a party's invitation message.
--
-- Intentionally does NOT bump `revision`: the revision guards concurrent edits to the
-- party's own details, and a copy is not an edit. Bumping it would invalidate an editor
-- the creator has open and surface a conflict they did not cause.
create function public.record_guest_invitation_copy(p_guest_party_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_party record;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_guest_party_id is null then
    raise exception 'Invalid copy record' using errcode = '22023';
  end if;

  select guest_parties.id
  into selected_party
  from public.guest_parties
  inner join public.workspace_members
    on workspace_members.workspace_id = guest_parties.workspace_id
  where guest_parties.id = p_guest_party_id
    and guest_parties.archived_at is null
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active';

  if not found then
    raise exception 'Guest party not found' using errcode = 'P0002';
  end if;

  update public.guest_parties
  set
    copy_count = copy_count + 1,
    first_copied_at = coalesce(first_copied_at, now()),
    last_copied_at = now()
  where id = p_guest_party_id;
end;
$$;

-- Sets or clears the creator's own "I have sent this" mark.
--
-- Reversible on purpose: a mis-tap would otherwise permanently mislabel a guest as
-- contacted, which is exactly the mistake this feature exists to prevent. Idempotent, so
-- a double submission is harmless. Like the copy record, it does not touch `revision`.
create function public.set_guest_invitation_sent(p_guest_party_id uuid, p_sent boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_party record;
  saved_marked_sent_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_guest_party_id is null or p_sent is null then
    raise exception 'Invalid sent mark' using errcode = '22023';
  end if;

  select guest_parties.marked_sent_at
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

  update public.guest_parties
  set marked_sent_at = case
    when p_sent then coalesce(selected_party.marked_sent_at, now())
    else null
  end
  where id = p_guest_party_id
  returning marked_sent_at into saved_marked_sent_at;

  return saved_marked_sent_at;
end;
$$;

revoke all on function public.record_guest_invitation_copy(uuid)
  from public, anon, service_role;
grant execute on function public.record_guest_invitation_copy(uuid) to authenticated;

revoke all on function public.set_guest_invitation_sent(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.set_guest_invitation_sent(uuid, boolean) to authenticated;

commit;
