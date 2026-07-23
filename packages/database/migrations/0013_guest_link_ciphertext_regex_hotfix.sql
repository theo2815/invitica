begin;

alter table public.guest_party_links
drop constraint guest_party_links_recovery_consistent;

alter table public.guest_party_links
add constraint guest_party_links_recovery_consistent check (
  (token_ciphertext is null and token_nonce is null and encryption_key_version is null)
  or (
    token_ciphertext ~ '^[A-Za-z0-9_-]{79}$'
    and token_nonce ~ '^[A-Za-z0-9_-]{16}$'
    and encryption_key_version >= 1
  )
);

do $$
declare
  function_definition text;
  function_signature regprocedure;
begin
  foreach function_signature in array array[
    'public.create_guest_parties_bulk(uuid,uuid,text,jsonb)'::regprocedure,
    'public.replace_guest_party_link_recoverable(uuid,uuid,text,text,text,integer)'::regprocedure
  ]
  loop
    select pg_get_functiondef(function_signature)
    into function_definition;

    if position('{32,256}' in function_definition) > 0 then
      execute replace(function_definition, '{32,256}', '{79}');
    elsif position('{79}' in function_definition) = 0 then
      raise exception 'Unexpected ciphertext validation in function %', function_signature
        using errcode = '55000';
    end if;
  end loop;
end;
$$;

commit;
