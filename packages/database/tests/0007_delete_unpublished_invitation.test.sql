begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(12);

select ok(
  has_function_privilege(
    'authenticated',
    'public.delete_unpublished_invitation(uuid)',
    'execute'
  ),
  'authenticated creators can execute unpublished invitation deletion'
);
select ok(
  not has_function_privilege('anon', 'public.delete_unpublished_invitation(uuid)', 'execute'),
  'anonymous users cannot execute unpublished invitation deletion'
);

delete from auth.users
where id in (
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'a2000000-0000-4000-8000-000000000002'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'delete-owner-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'delete-owner-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User A can provision a personal workspace'
);
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'a3000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000001',
      'Invitation to delete',
      'wedding',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000001'
      )
    )
  $create$,
  'User A can create an unpublished invitation'
);
select set_config(
  'test.deleted_event_id',
  (select event_id::text from public.invitations where id = 'a3000000-0000-4000-8000-000000000003'),
  true
);
select throws_ok(
  $$delete from public.invitations where id = 'a3000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'authenticated creators cannot bypass the deletion RPC'
);

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'User B can provision a separate personal workspace'
);
select throws_ok(
  $$select public.delete_unpublished_invitation('a3000000-0000-4000-8000-000000000003')$$,
  'P0002', null, 'another workspace cannot delete User A invitation'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.delete_unpublished_invitation('a3000000-0000-4000-8000-000000000003')$$,
  'the owner can delete an unpublished invitation'
);
select is(
  (select count(*) from public.invitations where id = 'a3000000-0000-4000-8000-000000000003'),
  0::bigint,
  'the invitation root is deleted'
);
select is(
  (select count(*) from public.invitation_drafts where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  0::bigint,
  'the invitation draft is deleted by cascade'
);
select is(
  (select count(*) from public.events where id = current_setting('test.deleted_event_id')::uuid),
  0::bigint,
  'the now-orphaned event is deleted'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.delete_unpublished_invitation('a3000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'anonymous deletion is denied'
);

set local role postgres;
select * from finish();
rollback;
