begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(14);

select is(
  (
    select template_id || '|' || renderer_key || '|' || editor_key
    from public.template_version_policies
    where template_version_id = '40000000-0000-4000-8000-000000000009'
  ),
  'a-little-question|little-question-v1|section-document-v1',
  'the immutable Romance template version is admitted at the database boundary'
);
select is(
  (
    select required_visible_section_types
    from public.template_version_policies
    where template_version_id = '40000000-0000-4000-8000-000000000009'
  ),
  array['hero', 'event-details', 'rsvp'],
  'the question and its response stay in every Romance invitation'
);
select has_function(
  'public',
  'invitation_validate_section_v0029',
  array['text', 'boolean', 'jsonb'],
  'the reviewed v0029 validator remains available privately'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.invitation_validate_section_v0029(text,boolean,jsonb)',
    'execute'
  ),
  'the previous validator remains a private implementation detail'
);
select lives_ok(
  $$select public.invitation_validate_section(
    'rsvp',
    true,
    '{
      "heading":"Will you go on a date with me?",
      "responseMode":"romantic-question",
      "declineButtonBehavior":"dodge-five"
    }'::jsonb
  )$$,
  'the bounded moving-No behavior passes the mutation boundary'
);
select throws_ok(
  $$select public.invitation_validate_section(
    'rsvp',
    true,
    '{"responseMode":"romantic-question","declineButtonBehavior":"dodge-five"}'::jsonb
  )$$,
  '22023',
  null,
  'a Romance response requires its question'
);
select throws_ok(
  $$select public.invitation_validate_section(
    'rsvp',
    true,
    '{
      "heading":"Will you go on a date with me?",
      "responseMode":"romantic-question",
      "declineButtonBehavior":"run-forever"
    }'::jsonb
  )$$,
  '22023',
  null,
  'an unbounded decline-button behavior is rejected'
);
select lives_ok(
  $$select public.invitation_validate_section(
    'rsvp', true, '{"heading":"Will you join us?"}'::jsonb
  )$$,
  'the established RSVP contract remains valid'
);

delete from auth.users
where id = 'e1000000-0000-4000-8000-000000000001'::uuid;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'e1000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'romance-owner@example.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'the Romance fixture owner receives an isolated workspace'
);
select set_config(
  'test.romance_workspace_id',
  (
    select workspace_id::text
    from public.workspace_members
    where user_id = 'e1000000-0000-4000-8000-000000000001'
  ),
  true
);

set local role postgres;
insert into public.events (
  id, workspace_id, name, occasion, event_timezone, locale
)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    current_setting('test.romance_workspace_id')::uuid,
    'A Little Question',
    'romance',
    'Asia/Manila',
    'en-PH'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    current_setting('test.romance_workspace_id')::uuid,
    'Standard celebration',
    'wedding',
    'Asia/Manila',
    'en-PH'
  );

select pass('the events occasion constraint accepts Romance');

insert into public.invitations (
  id, workspace_id, event_id, template_version_id
)
values
  (
    'e3000000-0000-4000-8000-000000000001',
    current_setting('test.romance_workspace_id')::uuid,
    'e2000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000009'
  ),
  (
    'e3000000-0000-4000-8000-000000000002',
    current_setting('test.romance_workspace_id')::uuid,
    'e2000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001'
  );

select throws_ok(
  $$insert into public.guest_parties (
    id, workspace_id, invitation_id, internal_label, recipient_name, capacity
  ) values (
    'e4000000-0000-4000-8000-000000000001',
    current_setting('test.romance_workspace_id')::uuid,
    'e3000000-0000-4000-8000-000000000001',
    'Mia and guest', 'Mia', 2
  )$$,
  '23514',
  null,
  'a Romance guest party cannot contain more than one recipient'
);

insert into public.guest_parties (
  id, workspace_id, invitation_id, internal_label, recipient_name, capacity
)
values
  (
    'e4000000-0000-4000-8000-000000000002',
    current_setting('test.romance_workspace_id')::uuid,
    'e3000000-0000-4000-8000-000000000001',
    'Mia', 'Mia', 1
  ),
  (
    'e4000000-0000-4000-8000-000000000003',
    current_setting('test.romance_workspace_id')::uuid,
    'e3000000-0000-4000-8000-000000000002',
    'Santos household', 'The Santos family', 4
  );

select throws_ok(
  $$insert into public.rsvp_responses (
    id, workspace_id, invitation_id, guest_party_id,
    attendance, attendee_count, message, last_mutation_id
  ) values (
    'e5000000-0000-4000-8000-000000000001',
    current_setting('test.romance_workspace_id')::uuid,
    'e3000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000002',
    'declined', 0, null,
    'e6000000-0000-4000-8000-000000000001'
  )$$,
  '23514',
  null,
  'No requires a message for a Romance invitation'
);

select lives_ok(
  $$insert into public.rsvp_responses (
    id, workspace_id, invitation_id, guest_party_id,
    attendance, attendee_count, message, last_mutation_id
  ) values (
    'e5000000-0000-4000-8000-000000000002',
    current_setting('test.romance_workspace_id')::uuid,
    'e3000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000002',
    'declined', 0, 'I cannot make it, but thank you for asking.',
    'e6000000-0000-4000-8000-000000000002'
  )$$,
  'a Romance decline with a message is saved'
);

select lives_ok(
  $$insert into public.rsvp_responses (
    id, workspace_id, invitation_id, guest_party_id,
    attendance, attendee_count, message, last_mutation_id
  ) values (
    'e5000000-0000-4000-8000-000000000003',
    current_setting('test.romance_workspace_id')::uuid,
    'e3000000-0000-4000-8000-000000000002',
    'e4000000-0000-4000-8000-000000000003',
    'declined', 0, null,
    'e6000000-0000-4000-8000-000000000003'
  )$$,
  'standard invitations still allow a decline without a message'
);

select * from finish();
rollback;
