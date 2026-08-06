begin;

/*
  Saved Tala conversations, so a creator can come back to one and continue it.

  This is a deliberate reversal of part of the 2026-08-05 cost decision, which said
  request metadata and outcomes are logged while prompt and response content is not.
  Founder-decided on 2026-08-06: history that survives a device change is worth more
  than content-free storage, and the alternatives were rejected — `sessionStorage`
  loses a thread when the tab closes, and `localStorage` leaves it on whatever
  machine the creator borrowed. Recorded in the Decision Register.

  `assistant_request_log` is unchanged and still carries no content. This is a
  creator-owned record the creator can read and delete; that is a different thing
  from an operator log, and the two must not be confused.

  Guest names reach this table. A creator who pastes a guest list in the organizing
  mode stores those names here, which is new — before this they existed only in
  browser memory and in transit to the model provider. That was the second half of
  the same founder decision. The mitigations are ownership and reach: rows are
  readable only by the creator who wrote them, deletable by that creator at any
  time, cascade-deleted with the account, and never joined to `guest_parties`, a
  publication snapshot, or anything a guest can open.
*/

create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  -- Written by the application from the creator's own first message, never by the
  -- model: a title is not worth a billed call, and a model-written one would be a
  -- second place a creator's words could be reworded without them seeing it.
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_conversations_title_bounds
    check (char_length(title) between 1 and 120)
);

-- The list is always read newest-first for one creator, and that is the only way it
-- is ever read.
create index assistant_conversations_creator_idx
on public.assistant_conversations (creator_id, updated_at desc);

create table public.assistant_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.assistant_conversations (id) on delete cascade,
  -- Position in the thread. Explicit rather than inferred from `created_at`, because
  -- the whole thread is rewritten in one statement and the timestamps within it are
  -- identical.
  ordinal integer not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint assistant_conversation_messages_role_known
    check (role in ('assistant', 'user')),
  -- Well above a 2,000-character question and a 600-token answer, and low enough
  -- that a malformed client cannot store a document here.
  constraint assistant_conversation_messages_content_bounds
    check (char_length(content) between 1 and 8000),
  constraint assistant_conversation_messages_ordinal_positive
    check (ordinal >= 1),
  unique (conversation_id, ordinal)
);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_conversation_messages enable row level security;

revoke all on table public.assistant_conversations
  from public, anon, authenticated, service_role;
revoke all on table public.assistant_conversation_messages
  from public, anon, authenticated, service_role;

-- Reads and deletes are direct, because row-level security expresses "your own rows"
-- exactly and a function wrapping it would only restate the policy in PL/pgSQL.
-- Inserts and updates are not: replacing a thread is several statements with bounds
-- and a per-creator cap between them, which is what the function below is for.
grant select, delete on table public.assistant_conversations to authenticated;
grant select on table public.assistant_conversation_messages to authenticated;

create policy assistant_conversations_select_own
on public.assistant_conversations
for select
to authenticated
using (creator_id = (select auth.uid()));

create policy assistant_conversations_delete_own
on public.assistant_conversations
for delete
to authenticated
using (creator_id = (select auth.uid()));

create policy assistant_conversation_messages_select_own
on public.assistant_conversation_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.assistant_conversations
    where assistant_conversations.id = assistant_conversation_messages.conversation_id
      and assistant_conversations.creator_id = (select auth.uid())
  )
);

/*
  Saves one thread whole, creating it on the first call and replacing its messages on
  every call after.

  Whole rather than appended because a thread is not append-only from the creator's
  side: stopping a half-written answer and editing the question that produced it
  removes the last two messages, and Start over removes all of them. An append API
  would need a companion "delete everything after position n" call, which is the same
  write expressed twice.

  The creator is read from the session inside the function rather than passed in, as
  in `consume_assistant_message`, so a caller cannot write into someone else's
  history. Bounds are re-checked here and not only in the application, because
  `authenticated` reaches this through PostgREST directly.
*/
create function public.save_assistant_conversation(
  p_conversation_id uuid,
  p_title text,
  p_messages jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Thirty threads is more history than a creator planning one event will produce and
  -- small enough that the list stays readable without paging. Older ones are pruned
  -- rather than refused, so saving never fails because a creator has been busy.
  max_conversations constant integer := 30;
  -- The API contract sends at most twenty messages to the model. This is the storage
  -- ceiling, above that so a stored thread is never the thing that fails first.
  max_messages constant integer := 40;
  max_content constant integer := 8000;
  current_user_id uuid := auth.uid();
  selected_id uuid;
  clean_title text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  clean_title := nullif(btrim(coalesce(p_title, '')), '');

  if clean_title is null or char_length(clean_title) > 120 then
    raise exception 'Invalid conversation title' using errcode = '22023';
  end if;

  if p_messages is null
    or jsonb_typeof(p_messages) <> 'array'
    or jsonb_array_length(p_messages) < 1
    or jsonb_array_length(p_messages) > max_messages
    or exists (
      select 1
      from jsonb_array_elements(p_messages) as entry(value)
      where jsonb_typeof(entry.value) <> 'object'
        or coalesce(entry.value ->> 'role', '') not in ('assistant', 'user')
        or coalesce(btrim(entry.value ->> 'content'), '') = ''
        or char_length(entry.value ->> 'content') > max_content
    ) then
    raise exception 'Invalid conversation messages' using errcode = '22023';
  end if;

  if p_conversation_id is null then
    insert into public.assistant_conversations (creator_id, title)
    values (current_user_id, clean_title)
    returning id into selected_id;
  else
    update public.assistant_conversations
    set title = clean_title, updated_at = now()
    where id = p_conversation_id
      and creator_id = current_user_id
    returning id into selected_id;

    -- Covers both a conversation that never existed and one belonging to someone
    -- else. They are the same answer on purpose: distinguishing them would confirm
    -- that another creator's conversation id is real.
    if selected_id is null then
      raise exception 'Conversation not found' using errcode = 'P0002';
    end if;

    delete from public.assistant_conversation_messages
    where assistant_conversation_messages.conversation_id = selected_id;
  end if;

  insert into public.assistant_conversation_messages (conversation_id, ordinal, role, content)
  select
    selected_id,
    entry.ordinal::integer,
    entry.value ->> 'role',
    entry.value ->> 'content'
  from jsonb_array_elements(p_messages) with ordinality as entry(value, ordinal);

  delete from public.assistant_conversations
  where creator_id = current_user_id
    and id not in (
      select kept.id
      from public.assistant_conversations as kept
      where kept.creator_id = current_user_id
      order by kept.updated_at desc, kept.id desc
      limit max_conversations
    );

  return selected_id;
end;
$$;

revoke all on function public.save_assistant_conversation(uuid, text, jsonb)
  from public, anon, service_role;
grant execute on function public.save_assistant_conversation(uuid, text, jsonb)
  to authenticated;

commit;
