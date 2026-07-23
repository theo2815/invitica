begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(5);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_guest_party(uuid,bigint,text,text,integer,text[])',
    'execute'
  ),
  'authenticated creators can execute the constrained party editor RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_guest_party(uuid,bigint,text,text,integer,text[])',
    'execute'
  )
    and not has_function_privilege(
      'service_role',
      'public.update_guest_party(uuid,bigint,text,text,integer,text[])',
      'execute'
    ),
  'anonymous and service roles cannot edit creator guest parties'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.update_guest_party(uuid,bigint,text,text,integer,text[])'::regprocedure
  ),
  true,
  'party edits run through a security-definer ownership boundary'
);

select ok(
  position(
    'Party capacity cannot be below the current attendee count' in pg_get_functiondef(
      'public.update_guest_party(uuid,bigint,text,text,integer,text[])'::regprocedure
    )
  ) > 0,
  'party editing preserves the current attending RSVP count'
);

select ok(
  not has_table_privilege('authenticated', 'public.guest_parties', 'update')
    and not has_table_privilege('authenticated', 'public.guests', 'insert')
    and not has_table_privilege('authenticated', 'public.guests', 'delete'),
  'direct authenticated party and member writes remain denied'
);

select * from finish();
rollback;
