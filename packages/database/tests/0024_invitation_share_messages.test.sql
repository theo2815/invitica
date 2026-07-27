begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
set local search_path = public, extensions, pg_catalog;

select plan(19);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_invitation_share_messages(uuid,text,text)',
    'execute'
  ),
  'authenticated creators can execute the share-message editor RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_invitation_share_messages(uuid,text,text)',
    'execute'
  )
    and not has_function_privilege(
      'service_role',
      'public.update_invitation_share_messages(uuid,text,text)',
      'execute'
    ),
  'anonymous and service roles cannot edit creator share messages'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.update_invitation_share_messages(uuid,text,text)'::regprocedure
  ),
  true,
  'share-message edits run through a security-definer ownership boundary'
);

select ok(
  not has_table_privilege('authenticated', 'public.invitations', 'update'),
  'direct authenticated writes to invitations remain denied'
);

select ok(
  has_column_privilege('authenticated', 'public.invitations', 'personal_share_message', 'select')
    and has_column_privilege('authenticated', 'public.invitations', 'general_share_message', 'select'),
  'creators can read back their own stored share messages'
);

delete from auth.users
where id in (
  '81000000-0000-4000-8000-000000000024'::uuid,
  '82000000-0000-4000-8000-000000000024'::uuid
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '81000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated',
    'share-message-owner@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '82000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated',
    'share-message-stranger@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000024', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'the owner can provision a personal workspace'
);

select lives_ok(
  $create$
    select public.create_invitation_draft(
      '83000000-0000-4000-8000-000000000024',
      '40000000-0000-4000-8000-000000000001',
      'Garden Promise invitation',
      'wedding',
      'Asia/Manila',
      'en-PH',
      jsonb_build_object(
        'schemaVersion', 1,
        'templateVersionId', '40000000-0000-4000-8000-000000000001',
        'sections', jsonb_build_array(
          jsonb_build_object(
            'id', '84000000-0000-4000-8000-000000000024',
            'type', 'hero',
            'visible', true,
            'animationPreset', 'fade-in',
            'props', jsonb_build_object('title', 'Mara & Joaquin')
          )
        )
      )
    )
  $create$,
  'the owner can create the invitation used by this suite'
);

select lives_ok(
  $$select public.update_invitation_share_messages(
      '83000000-0000-4000-8000-000000000024',
      '  Hi, {recipient} — {celebrant} {occasion}: {link}  ',
      'Dear, Family & Friends — {celebrant}: {link}'
    )$$,
  'the owner can store both share messages'
);

select is(
  (
    select personal_share_message
    from public.invitations
    where id = '83000000-0000-4000-8000-000000000024'
  ),
  'Hi, {recipient} — {celebrant} {occasion}: {link}',
  'the stored personal message is trimmed'
);

select is(
  (
    select general_share_message
    from public.invitations
    where id = '83000000-0000-4000-8000-000000000024'
  ),
  'Dear, Family & Friends — {celebrant}: {link}',
  'the stored general message is trimmed'
);

-- Without the link the guest can never reach the invitation, so the message is useless.
select throws_ok(
  $$select public.update_invitation_share_messages(
      '83000000-0000-4000-8000-000000000024', 'Hi, {recipient}!', null
    )$$,
  '22023', null,
  'a personal message without the link placeholder is rejected'
);

select throws_ok(
  $$select public.update_invitation_share_messages(
      '83000000-0000-4000-8000-000000000024', null, 'Dear, Family & Friends'
    )$$,
  '22023', null,
  'a general message without the link placeholder is rejected'
);

-- An unrecognised placeholder would reach a guest verbatim, as the literal text "{name}".
select throws_ok(
  $$select public.update_invitation_share_messages(
      '83000000-0000-4000-8000-000000000024', 'Hi, {name}! {link}', null
    )$$,
  '22023', null,
  'an unknown placeholder is rejected rather than pasted to a guest'
);

-- The general link addresses everyone at once and has no single recipient to name.
select throws_ok(
  $$select public.update_invitation_share_messages(
      '83000000-0000-4000-8000-000000000024', null, 'Hi, {recipient}! {link}'
    )$$,
  '22023', null,
  'the recipient placeholder is rejected in the general message'
);

select throws_ok(
  format(
    $$select public.update_invitation_share_messages(
        '83000000-0000-4000-8000-000000000024', %L, null
      )$$,
    repeat('a', 2000) || '{link}'
  ),
  '22023', null,
  'a message beyond the stored bound is rejected'
);

select lives_ok(
  $$select public.update_invitation_share_messages(
      '83000000-0000-4000-8000-000000000024', '   ', null
    )$$,
  'a blank message clears the customisation'
);

select ok(
  (
    select personal_share_message is null and general_share_message is null
    from public.invitations
    where id = '83000000-0000-4000-8000-000000000024'
  ),
  'clearing restores the generated default rather than storing whitespace'
);

select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000024', true);

select lives_ok(
  $$select public.ensure_personal_workspace()$$,
  'a second creator can provision their own workspace'
);

select throws_ok(
  $$select public.update_invitation_share_messages(
      '83000000-0000-4000-8000-000000000024', 'Hi, {recipient}! {link}', null
    )$$,
  'P0002', null,
  'a creator cannot rewrite another workspace''s share message'
);

select * from finish();
rollback;
