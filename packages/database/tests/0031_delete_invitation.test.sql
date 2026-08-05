begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(19);

select ok(
  has_function_privilege('authenticated', 'public.delete_invitation(uuid)', 'execute'),
  'authenticated creators can execute invitation deletion'
);
select ok(
  not has_function_privilege('anon', 'public.delete_invitation(uuid)', 'execute'),
  'anonymous users cannot execute invitation deletion'
);
select isnt(
  (
    select prosrc
    from pg_catalog.pg_proc
    where oid = 'public.delete_invitation(uuid)'::regprocedure
  ),
  (
    select prosrc
    from pg_catalog.pg_proc
    where oid = 'public.delete_unpublished_invitation(uuid)'::regprocedure
  ),
  'the new function is not a copy of the predecessor it stops using'
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
    'delete-published-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'delete-published-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
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
      'Published invitation to delete',
      'wedding',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000001'
      )
    )
  $create$,
  'User A can create an invitation'
);
select set_config(
  'test.workspace_id',
  (select workspace_id::text from public.invitations where id = 'a3000000-0000-4000-8000-000000000003'),
  true
);
select set_config(
  'test.deleted_event_id',
  (select event_id::text from public.invitations where id = 'a3000000-0000-4000-8000-000000000003'),
  true
);

-- Published state is inserted directly rather than through
-- `request_invitation_publication`, so the fixture stays independent of whichever
-- template allowlist that RPC currently enforces. The snapshot only has to satisfy
-- `publication_versions_snapshot_pins_match`.
set local role postgres;
select lives_ok(
  $publish$
    with fixture as (
      select
        current_setting('test.workspace_id')::uuid as workspace_id,
        'a3000000-0000-4000-8000-000000000003'::uuid as invitation_id,
        '40000000-0000-4000-8000-000000000001'::uuid as template_version_id
    ),
    published as (
      insert into public.publication_versions (
        id, workspace_id, invitation_id, publication_number, idempotency_key,
        snapshot_version, invitation_schema_version, renderer_key, renderer_version,
        template_version_id, template_version, draft_revision, snapshot
      )
      select
        'a4000000-0000-4000-8000-000000000004',
        fixture.workspace_id,
        fixture.invitation_id,
        1,
        'a5000000-0000-4000-8000-000000000005',
        1, 1, 'garden-promise-v1', 1,
        fixture.template_version_id, 1, 1,
        jsonb_build_object(
          'snapshotVersion', '1',
          'invitationSchemaVersion', '1',
          'rendererKey', 'garden-promise-v1',
          'rendererVersion', '1',
          'templateVersionId', fixture.template_version_id::text,
          'templateVersion', '1',
          'draftRevision', '1',
          'assets', '[]'::jsonb,
          'document', jsonb_build_object(
            'schemaVersion', '1',
            'templateVersionId', fixture.template_version_id::text
          )
        )
      from fixture
      returning id, workspace_id, invitation_id
    ),
    built as (
      insert into public.publication_builds (
        publication_id, workspace_id, invitation_id, status,
        artifact_key, artifact_sha256, completed_at
      )
      select
        published.id, published.workspace_id, published.invitation_id, 'completed',
        'publication-artifacts/v2/a4000000-0000-4000-8000-000000000004.json',
        repeat('a', 64),
        now()
      from published
      returning publication_id
    )
    insert into public.publication_aliases (
      workspace_id, invitation_id, public_identifier,
      active_publication_id, delivered_publication_id, delivery_status, delivered_at
    )
    select
      published.workspace_id, published.invitation_id, repeat('b', 32),
      published.id, published.id, 'delivered', now()
    from published, built
  $publish$,
  'the invitation is published with a live alias'
);

insert into public.guest_parties (workspace_id, invitation_id, internal_label, recipient_name, capacity)
values (
  current_setting('test.workspace_id')::uuid,
  'a3000000-0000-4000-8000-000000000003',
  'Reyes family',
  'The Reyes family',
  4
);

insert into public.rsvp_responses (
  workspace_id, invitation_id, guest_party_id, attendance, attendee_count, last_mutation_id
)
select
  guest_parties.workspace_id,
  guest_parties.invitation_id,
  guest_parties.id,
  'attending',
  3,
  'a6000000-0000-4000-8000-000000000006'
from public.guest_parties
where guest_parties.invitation_id = 'a3000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
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
  $$select public.delete_invitation('a3000000-0000-4000-8000-000000000003')$$,
  'P0002', null, 'another workspace cannot delete User A invitation'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.delete_invitation('a3000000-0000-4000-8000-000000000003')$$,
  'the owner can delete a published invitation'
);

set local role postgres;
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
  (select count(*) from public.publication_versions where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  0::bigint,
  'the publication snapshot is deleted by cascade'
);
select is(
  (select count(*) from public.publication_builds where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  0::bigint,
  'the publication build is deleted by cascade'
);
select is(
  (select count(*) from public.publication_aliases where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  0::bigint,
  'the publication alias is deleted despite pointing at a cascaded publication'
);
select is(
  (select count(*) from public.guest_parties where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  0::bigint,
  'guest parties are deleted by cascade'
);
select is(
  (select count(*) from public.rsvp_responses where invitation_id = 'a3000000-0000-4000-8000-000000000003'),
  0::bigint,
  'guest replies are deleted by cascade'
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
  $$select public.delete_invitation('a3000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'anonymous deletion is denied'
);

set local role postgres;
select * from finish();
rollback;
