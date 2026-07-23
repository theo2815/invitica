begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(3);

select ok(
  position(
    '{79}' in (
      select pg_get_constraintdef(oid)
      from pg_constraint
      where conrelid = 'public.guest_party_links'::regclass
        and conname = 'guest_party_links_recovery_consistent'
    )
  ) > 0,
  'the recovery constraint uses PostgreSQL-safe exact ciphertext length validation'
);

select ok(
  position(
    '{79}' in pg_get_functiondef(
      'public.create_guest_parties_bulk(uuid,uuid,text,jsonb)'::regprocedure
    )
  ) > 0,
  'bulk creation uses the corrected ciphertext validation'
);

select ok(
  position(
    '{79}' in pg_get_functiondef(
      'public.replace_guest_party_link_recoverable(uuid,uuid,text,text,text,integer)'::regprocedure
    )
  ) > 0,
  'link replacement uses the corrected ciphertext validation'
);

select * from finish();
rollback;
