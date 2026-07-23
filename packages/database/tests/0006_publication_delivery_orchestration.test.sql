begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(36);

create function pg_temp.garden_document(p_title text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'templateVersionId', '40000000-0000-4000-8000-000000000001',
    'locale', 'en-PH',
    'eventTimezone', 'Asia/Manila',
    'theme', jsonb_build_object(
      'colors', jsonb_build_object(
        'background', '#e8eadf',
        'surface', '#fffdf6',
        'text', '#344033',
        'accent', '#687a5a',
        'accentContrast', '#ffffff'
      ),
      'typography', jsonb_build_object(
        'headingFontId', 'fraunces',
        'bodyFontId', 'instrument-sans'
      ),
      'spacingScale', 'spacious'
    ),
    'opening', jsonb_build_object(
      'preset', 'ribbon-envelope-letter',
      'motionStyle', 'elegant',
      'recipientMode', 'personalized',
      'fallbackRecipientText', 'Our dear guest'
    ),
    'sections', jsonb_build_array(
      jsonb_build_object(
        'id', 'a4000000-0000-4000-8000-000000000001',
        'type', 'hero',
        'visible', true,
        'animationPreset', 'fade-in',
        'props', jsonb_build_object('title', p_title)
      )
    ),
    'assets', jsonb_build_array()
  )
$$;

create function pg_temp.garden_snapshot(p_revision bigint, p_title text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'snapshotVersion', 1,
    'invitationSchemaVersion', 1,
    'rendererKey', 'garden-promise-v1',
    'rendererVersion', 1,
    'templateVersionId', '40000000-0000-4000-8000-000000000001',
    'templateVersion', 1,
    'draftRevision', p_revision,
    'document', pg_temp.garden_document(p_title),
    'assets', jsonb_build_array()
  )
$$;

select ok(
  has_function_privilege('service_role', 'public.start_invitation_publication(uuid)', 'execute')
  and has_function_privilege(
    'service_role',
    'public.select_invitation_publication_delivery(uuid)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.record_invitation_publication_delivery_failure(uuid,text,boolean)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.confirm_invitation_publication_delivery(uuid)',
    'execute'
  ),
  'the service role owns every orchestration transition'
);
select ok(
  not has_function_privilege('authenticated', 'public.start_invitation_publication(uuid)', 'execute')
  and not has_function_privilege(
    'authenticated',
    'public.select_invitation_publication_delivery(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.confirm_invitation_publication_delivery(uuid)',
    'execute'
  ),
  'creator sessions cannot claim job or delivery progress'
);
select ok(
  (
    select count(*) = 3
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'publication_aliases' and column_name in ('delivered_publication_id', 'delivery_status'))
        or (table_name = 'publication_builds' and column_name = 'attempt_count')
      )
  ),
  'delivery truth and observable build attempts are stored separately'
);

delete from auth.users where id = 'b1000000-0000-4000-8000-000000000001'::uuid;
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'delivery-test@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'the creator can provision the delivery-test workspace'
);
select lives_ok(
  $create$
    select public.create_invitation_draft(
      'b3000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Garden Promise delivery test',
      'wedding',
      'Asia/Manila',
      'en-PH',
      pg_temp.garden_document('Mara & Joaquin')
    )
  $create$,
  'the owner can create the publication-ready draft'
);
select lives_ok(
  $request$
    select set_config(
      'test.delivery_publication_one',
      public.request_invitation_publication(
        'b3000000-0000-4000-8000-000000000001',
        1,
        'b5000000-0000-4000-8000-000000000001',
        pg_temp.garden_snapshot(1, 'Mara & Joaquin')
      )::text,
      true
    )
  $request$,
  'the owner can create the first immutable publication'
);
select is(
  public.request_invitation_publication(
    'b3000000-0000-4000-8000-000000000001',
    1,
    'b5000000-0000-4000-8000-000000000002',
    pg_temp.garden_snapshot(1, 'Mara & Joaquin')
  ),
  current_setting('test.delivery_publication_one')::uuid,
  'the same invitation revision reuses one publication across browser retries'
);
select is((select count(*) from public.publication_versions), 1::bigint, 'the retry creates no duplicate version');
select ok(
  (
    select status = 'pending' and attempt_count = 0 and last_started_at is null
    from public.publication_builds
    where publication_id = current_setting('test.delivery_publication_one')::uuid
  ),
  'a requested publication is observably queued before a job starts'
);

set local role service_role;
select lives_ok(
  format('select public.start_invitation_publication(%L)', current_setting('test.delivery_publication_one')),
  'the job can start the queued build'
);
select ok(
  (
    select status = 'pending' and attempt_count = 1 and last_started_at is not null
    from public.publication_builds
    where publication_id = current_setting('test.delivery_publication_one')::uuid
  ),
  'the build records its first attempt without changing immutable data'
);
select lives_ok(
  format(
    'select public.fail_invitation_publication(%L, %L)',
    current_setting('test.delivery_publication_one'),
    'artifact_write_failed'
  ),
  'a pre-artifact failure can fail the build'
);
select is(
  (select status from public.publication_builds where publication_id = current_setting('test.delivery_publication_one')::uuid),
  'failed',
  'the failed build remains visible'
);
select lives_ok(
  format('select public.start_invitation_publication(%L)', current_setting('test.delivery_publication_one')),
  'a retry can restart the same failed build'
);
select ok(
  (
    select status = 'pending' and attempt_count = 2 and error_code is null
    from public.publication_builds
    where publication_id = current_setting('test.delivery_publication_one')::uuid
  ),
  'the retry clears terminal state and increments the attempt count'
);
select lives_ok(
  format(
    'select public.complete_invitation_publication(%L, %L, %L)',
    current_setting('test.delivery_publication_one'),
    'publication-artifacts/v1/b6000000-0000-4000-8000-000000000001.json',
    repeat('a', 64)
  ),
  'verified immutable artifact metadata completes the build'
);
select ok(
  public.select_invitation_publication_delivery(current_setting('test.delivery_publication_one')::uuid),
  'the completed build can become desired delivery state'
);
select ok(
  (
    select active_publication_id = current_setting('test.delivery_publication_one')::uuid
      and delivered_publication_id is null
      and delivery_status = 'pending'
    from public.publication_aliases
  ),
  'desired state is not presented as delivered before alias verification'
);
select ok(
  public.record_invitation_publication_delivery_failure(
    current_setting('test.delivery_publication_one')::uuid,
    'alias_write_failed',
    false
  ),
  'a retryable alias failure is recorded only for the desired publication'
);
select ok(
  (
    select delivery_status = 'retrying'
      and delivery_attempt_count = 1
      and delivery_error_code = 'alias_write_failed'
    from public.publication_aliases
  ),
  'the alias exposes bounded retry state without claiming delivery'
);
select ok(
  public.confirm_invitation_publication_delivery(current_setting('test.delivery_publication_one')::uuid),
  'verified alias delivery can be confirmed'
);
select ok(
  (
    select delivery_status = 'delivered'
      and active_publication_id = delivered_publication_id
      and delivered_at is not null
    from public.publication_aliases
  ),
  'confirmed delivery makes desired and delivered truth agree'
);

set local role postgres;
update public.invitation_drafts
set document = pg_temp.garden_document('Lira & Mateo'), revision = 2
where invitation_id = 'b3000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $request$
    select set_config(
      'test.delivery_publication_two',
      public.request_invitation_publication(
        'b3000000-0000-4000-8000-000000000001',
        2,
        'b5000000-0000-4000-8000-000000000003',
        pg_temp.garden_snapshot(2, 'Lira & Mateo')
      )::text,
      true
    )
  $request$,
  'a saved later revision creates the next immutable publication'
);

set local role service_role;
select lives_ok(
  format(
    'select public.start_invitation_publication(%1$L); select public.complete_invitation_publication(%1$L, %2$L, %3$L); select public.select_invitation_publication_delivery(%1$L)',
    current_setting('test.delivery_publication_two'),
    'publication-artifacts/v1/b6000000-0000-4000-8000-000000000002.json',
    repeat('b', 64)
  ),
  'the job can build and select the newer publication'
);
select ok(
  (
    select active_publication_id = current_setting('test.delivery_publication_two')::uuid
      and delivered_publication_id = current_setting('test.delivery_publication_one')::uuid
      and delivery_status = 'pending'
    from public.publication_aliases
  ),
  'the prior delivered pointer stays readable while the new alias is pending'
);
select ok(
  public.record_invitation_publication_delivery_failure(
    current_setting('test.delivery_publication_two')::uuid,
    'alias_verification_failed',
    true
  ),
  'the desired newer delivery can reach a terminal failed state'
);
select ok(
  (
    select delivery_status = 'failed'
      and active_publication_id = current_setting('test.delivery_publication_two')::uuid
      and delivered_publication_id = current_setting('test.delivery_publication_one')::uuid
    from public.publication_aliases
  ),
  'a failed new delivery preserves the previous delivered publication'
);
select ok(
  not public.select_invitation_publication_delivery(current_setting('test.delivery_publication_one')::uuid),
  'an older automatic job cannot replace newer desired state'
);
select is(
  (select active_publication_id from public.publication_aliases),
  current_setting('test.delivery_publication_two')::uuid,
  'stale selection leaves desired state unchanged'
);
select ok(
  not public.record_invitation_publication_delivery_failure(
    current_setting('test.delivery_publication_one')::uuid,
    'delayed_old_failure',
    true
  ),
  'a delayed old failure cannot overwrite newer delivery state'
);
select ok(
  public.confirm_invitation_publication_delivery(current_setting('test.delivery_publication_two')::uuid),
  'the newer alias can confirm after a safe retry'
);
select is(
  (select delivered_publication_id from public.publication_aliases),
  current_setting('test.delivery_publication_two')::uuid,
  'the newer publication becomes actual delivery truth'
);
select is(
  public.rollback_invitation_publication(current_setting('test.delivery_publication_one')::uuid),
  (select public_identifier from public.publication_aliases),
  'explicit rollback can select an older completed publication'
);
select ok(
  (
    select delivery_status = 'pending'
      and active_publication_id = current_setting('test.delivery_publication_one')::uuid
      and delivered_publication_id = current_setting('test.delivery_publication_two')::uuid
    from public.publication_aliases
  ),
  'rollback remains pending until the older alias is actually verified'
);
select ok(
  public.confirm_invitation_publication_delivery(current_setting('test.delivery_publication_one')::uuid),
  'the verified rollback can confirm delivery'
);
select ok(
  (
    select delivery_status = 'delivered'
      and active_publication_id = current_setting('test.delivery_publication_one')::uuid
      and delivered_publication_id = current_setting('test.delivery_publication_one')::uuid
    from public.publication_aliases
  ),
  'confirmed rollback restores matching desired and delivered truth'
);

set local role postgres;
select * from finish();
delete from auth.users where id = 'b1000000-0000-4000-8000-000000000001'::uuid;
rollback;
