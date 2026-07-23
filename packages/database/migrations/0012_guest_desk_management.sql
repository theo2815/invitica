begin;

alter table public.guest_parties
  add column revision bigint not null default 1,
  add column archived_at timestamptz,
  add column creation_mutation_id uuid,
  add column creation_request_hash text,
  add column creation_row_index integer,
  add constraint guest_parties_revision_positive check (revision >= 1),
  add constraint guest_parties_creation_metadata_consistent check (
    (creation_mutation_id is null and creation_request_hash is null and creation_row_index is null)
    or (
      creation_mutation_id is not null
      and creation_request_hash ~ '^[0-9a-f]{64}$'
      and creation_row_index >= 1
    )
  );

create unique index guest_parties_creation_row_unique_idx
on public.guest_parties (workspace_id, creation_mutation_id, creation_row_index)
where creation_mutation_id is not null;

create index guest_parties_active_invitation_idx
on public.guest_parties (workspace_id, invitation_id, created_at, id)
where archived_at is null;

alter table public.guest_party_links
  add column token_ciphertext text,
  add column token_nonce text,
  add column encryption_key_version integer,
  add constraint guest_party_links_recovery_consistent check (
    (token_ciphertext is null and token_nonce is null and encryption_key_version is null)
    or (
      token_ciphertext ~ '^[A-Za-z0-9_-]{79}$'
      and token_nonce ~ '^[A-Za-z0-9_-]{16}$'
      and encryption_key_version >= 1
    )
  );

create function public.clear_revoked_guest_link_recovery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'revoked' then
    new.token_ciphertext := null;
    new.token_nonce := null;
    new.encryption_key_version := null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_revoked_guest_link_recovery()
  from public, anon, authenticated, service_role;

create trigger guest_party_links_clear_recovery_when_revoked
before insert or update of status on public.guest_party_links
for each row
execute function public.clear_revoked_guest_link_recovery();

revoke select on table public.guest_parties from authenticated;
grant select (
  id,
  workspace_id,
  invitation_id,
  internal_label,
  recipient_name,
  capacity,
  revision,
  archived_at,
  created_at,
  updated_at
) on table public.guest_parties to authenticated;

revoke select on table public.guest_party_links from authenticated;
grant select (
  id,
  workspace_id,
  invitation_id,
  guest_party_id,
  status,
  created_at,
  revoked_at
) on table public.guest_party_links to authenticated;

create function public.create_guest_parties_bulk(
  p_invitation_id uuid,
  p_mutation_id uuid,
  p_request_hash text,
  p_parties jsonb
)
returns table (guest_party_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_workspace_id uuid;
  party_count integer;
  existing_count integer;
  party_item jsonb;
  party_index integer;
  selected_party_id uuid;
  selected_link_id uuid;
  selected_internal_label text;
  selected_recipient_name text;
  selected_capacity integer;
  selected_guest_names text[];
  selected_token_hash text;
  selected_token_ciphertext text;
  selected_token_nonce text;
  selected_key_version integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  p_request_hash := lower(btrim(p_request_hash));
  if p_invitation_id is null
    or p_mutation_id is null
    or p_request_hash is null
    or p_request_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_parties) <> 'array' then
    raise exception 'Invalid guest-party batch' using errcode = '22023';
  end if;

  party_count := jsonb_array_length(p_parties);
  if party_count not between 1 and 50 then
    raise exception 'Guest-party batch must contain between 1 and 50 rows'
      using errcode = '22023';
  end if;

  select invitations.workspace_id
  into selected_workspace_id
  from public.invitations
  inner join public.workspace_members
    on workspace_members.workspace_id = invitations.workspace_id
  inner join public.publication_aliases
    on publication_aliases.workspace_id = invitations.workspace_id
    and publication_aliases.invitation_id = invitations.id
  where invitations.id = p_invitation_id
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
    and publication_aliases.delivery_status = 'delivered'
    and publication_aliases.delivered_publication_id is not null;

  if not found then
    raise exception 'Delivered invitation not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_mutation_id::text, 0));

  select count(*)::integer
  into existing_count
  from public.guest_parties
  where workspace_id = selected_workspace_id
    and creation_mutation_id = p_mutation_id;

  if existing_count > 0 then
    if existing_count <> party_count or exists (
      select 1
      from public.guest_parties
      where workspace_id = selected_workspace_id
        and creation_mutation_id = p_mutation_id
        and (
          invitation_id <> p_invitation_id
          or creation_request_hash <> p_request_hash
        )
    ) then
      raise exception 'Guest-party mutation key was reused with different input'
        using errcode = '23505';
    end if;

    return query
      select id
      from public.guest_parties
      where workspace_id = selected_workspace_id
        and creation_mutation_id = p_mutation_id
      order by creation_row_index;
    return;
  end if;

  for party_item, party_index in
    select value, ordinality::integer
    from jsonb_array_elements(p_parties) with ordinality
  loop
    begin
      selected_party_id := (party_item ->> 'partyId')::uuid;
      selected_link_id := (party_item ->> 'linkId')::uuid;
      selected_internal_label := btrim(party_item ->> 'internalLabel');
      selected_recipient_name := btrim(party_item ->> 'recipientName');
      selected_capacity := (party_item ->> 'capacity')::integer;
      selected_guest_names := coalesce(
        array(
          select btrim(value)
          from jsonb_array_elements_text(party_item -> 'guestNames')
        ),
        array[]::text[]
      );
      selected_token_hash := lower(btrim(party_item ->> 'tokenHash'));
      selected_token_ciphertext := btrim(party_item ->> 'tokenCiphertext');
      selected_token_nonce := btrim(party_item ->> 'tokenNonce');
      selected_key_version := (party_item ->> 'encryptionKeyVersion')::integer;
    exception when others then
      raise exception 'Invalid guest-party row %', party_index using errcode = '22023';
    end;

    if selected_party_id is null
      or selected_link_id is null
      or selected_internal_label is null
      or char_length(selected_internal_label) not between 1 and 120
      or selected_recipient_name is null
      or char_length(selected_recipient_name) not between 1 and 120
      or selected_capacity not between 1 and 50
      or cardinality(selected_guest_names) > selected_capacity
      or exists (
        select 1
        from unnest(selected_guest_names) as guest_name
        where guest_name is null or char_length(guest_name) not between 1 and 120
      )
      or selected_token_hash !~ '^[0-9a-f]{64}$'
      or selected_token_ciphertext !~ '^[A-Za-z0-9_-]{79}$'
      or selected_token_nonce !~ '^[A-Za-z0-9_-]{16}$'
      or selected_key_version < 1 then
      raise exception 'Invalid guest-party row %', party_index using errcode = '22023';
    end if;

    insert into public.guest_parties (
      id,
      workspace_id,
      invitation_id,
      internal_label,
      recipient_name,
      capacity,
      creation_mutation_id,
      creation_request_hash,
      creation_row_index
    )
    values (
      selected_party_id,
      selected_workspace_id,
      p_invitation_id,
      selected_internal_label,
      selected_recipient_name,
      selected_capacity,
      p_mutation_id,
      p_request_hash,
      party_index
    );

    insert into public.guests (
      workspace_id,
      invitation_id,
      guest_party_id,
      name,
      sort_order
    )
    select
      selected_workspace_id,
      p_invitation_id,
      selected_party_id,
      guest_name,
      ordinal::integer
    from unnest(selected_guest_names) with ordinality as names(guest_name, ordinal);

    insert into public.guest_party_links (
      id,
      workspace_id,
      invitation_id,
      guest_party_id,
      token_hash,
      token_ciphertext,
      token_nonce,
      encryption_key_version
    )
    values (
      selected_link_id,
      selected_workspace_id,
      p_invitation_id,
      selected_party_id,
      selected_token_hash,
      selected_token_ciphertext,
      selected_token_nonce,
      selected_key_version
    );

    guest_party_id := selected_party_id;
    return next;
  end loop;
end;
$$;

create function public.replace_guest_party_link_recoverable(
  p_guest_party_id uuid,
  p_link_id uuid,
  p_token_hash text,
  p_token_ciphertext text,
  p_token_nonce text,
  p_encryption_key_version integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_party record;
begin
  p_token_hash := lower(btrim(p_token_hash));
  p_token_ciphertext := btrim(p_token_ciphertext);
  p_token_nonce := btrim(p_token_nonce);

  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_guest_party_id is null
    or p_link_id is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_token_ciphertext !~ '^[A-Za-z0-9_-]{79}$'
    or p_token_nonce !~ '^[A-Za-z0-9_-]{16}$'
    or p_encryption_key_version < 1 then
    raise exception 'Invalid guest link replacement' using errcode = '22023';
  end if;

  select guest_parties.workspace_id, guest_parties.invitation_id
  into selected_party
  from public.guest_parties
  inner join public.workspace_members
    on workspace_members.workspace_id = guest_parties.workspace_id
  inner join public.publication_aliases
    on publication_aliases.workspace_id = guest_parties.workspace_id
    and publication_aliases.invitation_id = guest_parties.invitation_id
  where guest_parties.id = p_guest_party_id
    and guest_parties.archived_at is null
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
    and publication_aliases.delivery_status = 'delivered'
    and publication_aliases.delivered_publication_id is not null
  for update of guest_parties;

  if not found then
    raise exception 'Guest party not found' using errcode = 'P0002';
  end if;

  update public.guest_party_links
  set
    status = 'revoked',
    revoked_at = now(),
    token_ciphertext = null,
    token_nonce = null,
    encryption_key_version = null
  where guest_party_id = p_guest_party_id and status = 'active';

  insert into public.guest_party_links (
    id,
    workspace_id,
    invitation_id,
    guest_party_id,
    token_hash,
    token_ciphertext,
    token_nonce,
    encryption_key_version
  )
  values (
    p_link_id,
    selected_party.workspace_id,
    selected_party.invitation_id,
    p_guest_party_id,
    p_token_hash,
    p_token_ciphertext,
    p_token_nonce,
    p_encryption_key_version
  );

  return p_link_id;
end;
$$;

create function public.get_guest_party_link_secret(p_guest_party_id uuid)
returns table (
  link_id uuid,
  recipient_name text,
  token_ciphertext text,
  token_nonce text,
  encryption_key_version integer
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    guest_party_links.id,
    guest_parties.recipient_name,
    guest_party_links.token_ciphertext,
    guest_party_links.token_nonce,
    guest_party_links.encryption_key_version
  from public.guest_parties
  inner join public.workspace_members
    on workspace_members.workspace_id = guest_parties.workspace_id
  inner join public.guest_party_links
    on guest_party_links.workspace_id = guest_parties.workspace_id
    and guest_party_links.invitation_id = guest_parties.invitation_id
    and guest_party_links.guest_party_id = guest_parties.id
  where guest_parties.id = p_guest_party_id
    and guest_parties.archived_at is null
    and workspace_members.user_id = (select auth.uid())
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
    and guest_party_links.status = 'active'
  limit 1;
$$;

create function public.remove_guest_member(
  p_guest_party_id uuid,
  p_guest_id uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_party record;
  saved_revision bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select guest_parties.workspace_id, guest_parties.invitation_id, guest_parties.revision
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

  delete from public.guests
  where id = p_guest_id
    and workspace_id = selected_party.workspace_id
    and invitation_id = selected_party.invitation_id
    and guest_party_id = p_guest_party_id;

  if not found then
    raise exception 'Guest member not found' using errcode = 'P0002';
  end if;

  update public.guest_parties
  set revision = revision + 1
  where id = p_guest_party_id
  returning revision into saved_revision;
  return saved_revision;
end;
$$;

create function public.trash_guest_party(
  p_guest_party_id uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_revision bigint;
  saved_revision bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select guest_parties.revision
  into selected_revision
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
  if selected_revision <> p_expected_revision then
    raise exception 'Guest party revision conflict' using errcode = '40001';
  end if;

  update public.guest_party_links
  set
    status = 'revoked',
    revoked_at = now(),
    token_ciphertext = null,
    token_nonce = null,
    encryption_key_version = null
  where guest_party_id = p_guest_party_id and status = 'active';

  update public.guest_parties
  set archived_at = now(), revision = revision + 1
  where id = p_guest_party_id
  returning revision into saved_revision;
  return saved_revision;
end;
$$;

create function public.restore_guest_party(
  p_guest_party_id uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_revision bigint;
  saved_revision bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select guest_parties.revision
  into selected_revision
  from public.guest_parties
  inner join public.workspace_members
    on workspace_members.workspace_id = guest_parties.workspace_id
  where guest_parties.id = p_guest_party_id
    and guest_parties.archived_at is not null
    and workspace_members.user_id = current_user_id
    and workspace_members.role = 'owner'
    and workspace_members.status = 'active'
  for update of guest_parties;

  if not found then
    raise exception 'Trashed guest party not found' using errcode = 'P0002';
  end if;
  if selected_revision <> p_expected_revision then
    raise exception 'Guest party revision conflict' using errcode = '40001';
  end if;

  update public.guest_parties
  set archived_at = null, revision = revision + 1
  where id = p_guest_party_id
  returning revision into saved_revision;
  return saved_revision;
end;
$$;

create or replace function public.revoke_guest_party_link(p_guest_party_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_guest_party_id is null then
    raise exception 'Invalid guest link revocation' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.guest_parties
    inner join public.workspace_members
      on workspace_members.workspace_id = guest_parties.workspace_id
    where guest_parties.id = p_guest_party_id
      and guest_parties.archived_at is null
      and workspace_members.user_id = current_user_id
      and workspace_members.role = 'owner'
      and workspace_members.status = 'active'
  ) then
    raise exception 'Guest party not found' using errcode = 'P0002';
  end if;

  update public.guest_party_links
  set
    status = 'revoked',
    revoked_at = now(),
    token_ciphertext = null,
    token_nonce = null,
    encryption_key_version = null
  where guest_party_id = p_guest_party_id
    and status = 'active';

  return found;
end;
$$;

revoke all on function public.create_guest_parties_bulk(uuid, uuid, text, jsonb)
  from public, anon, service_role;
grant execute on function public.create_guest_parties_bulk(uuid, uuid, text, jsonb)
  to authenticated;

revoke all on function public.replace_guest_party_link_recoverable(uuid, uuid, text, text, text, integer)
  from public, anon, service_role;
grant execute on function public.replace_guest_party_link_recoverable(uuid, uuid, text, text, text, integer)
  to authenticated;

revoke all on function public.get_guest_party_link_secret(uuid)
  from public, anon, service_role;
grant execute on function public.get_guest_party_link_secret(uuid)
  to authenticated;

revoke all on function public.remove_guest_member(uuid, uuid, bigint)
  from public, anon, service_role;
grant execute on function public.remove_guest_member(uuid, uuid, bigint)
  to authenticated;

revoke all on function public.trash_guest_party(uuid, bigint)
  from public, anon, service_role;
grant execute on function public.trash_guest_party(uuid, bigint)
  to authenticated;

revoke all on function public.restore_guest_party(uuid, bigint)
  from public, anon, service_role;
grant execute on function public.restore_guest_party(uuid, bigint)
  to authenticated;

commit;
