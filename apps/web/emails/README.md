# Invitica emails

Every email a creator receives, in one visual system.

## Where each one comes from

| Email | Sent by | Source |
|---|---|---|
| Password recovery code | Supabase Auth → Resend SMTP | `scripts/supabase-email-templates.ts` → `supabase/reset-password.html` |
| Confirm signup | Supabase Auth → Resend SMTP | `scripts/supabase-email-templates.ts` → `supabase/confirm-signup.html` |
| Change email address | Supabase Auth → Resend SMTP | `scripts/supabase-email-templates.ts` → `supabase/change-email.html` |
| Account deletion link | **Invitica**, Resend REST API | `src/server/account/deletion-email.ts` |

Only the last one is sent by this application. Supabase Auth has no deletion email type, which is the
whole reason `RESEND_API_KEY` and `ACCOUNT_EMAIL_FROM` exist in `apps/web` — separately from the
Resend credentials configured as Supabase's SMTP provider.

All four are built from `src/server/account/email-layout.ts`, so the brand cannot drift between the
message Invitica sends and the three Supabase sends.

## Regenerating and installing the Supabase templates

```bash
node apps/web/scripts/build-supabase-templates.ts
```

Then paste each file into **Supabase Dashboard → Authentication → Emails → Templates**, matching the
name the script prints. **Nothing automates this** — Supabase exposes no API for auth email
templates, so the Dashboard is the only place they take effect and this folder is the only place
they are reviewable.

Run the generator after any change to `email-layout.ts` or `supabase-email-templates.ts`, and paste
again. A checked-in file that has not been pasted is not live.

## The one contract that must not break

**The Reset Password template must contain `{{ .Token }}`.**

Invitica verifies recovery with `verifyOtp({ type: "recovery" })` and its UI asks for a six-digit
code (`apps/web/src/server/auth/actions.ts`, `PasswordRecoveryPage.tsx`). Supabase's stock template
ships `{{ .ConfirmationURL }}` instead — a link. With that installed, a creator receives a link while
the app asks for a code that was never in the email, and password recovery is unusable.
`apps/web/tests/EmailTemplates.test.ts` asserts the token is present.

The other two deliberately use `{{ .ConfirmationURL }}` rather than a hand-built `{{ .TokenHash }}`
URL, because Supabase folds the app's `emailRedirectTo` into it. Rebuilding the URL by hand would
drop the `next` path and land a confirmed creator on the public landing page.

**And the code must be six digits.** `{{ .Token }}` renders whatever length
**Authentication → Emails → Email OTP Length** is set to, which Supabase allows to be 6 through 10.
The app enforces six in six separate places and cannot read that setting. It was found set to 8 on
2026-08-07 and password recovery did not work at all until it was put back —
`Operations/Known Environment Issues.md` in the vault has the detail.

## Previewing

```bash
node apps/web/scripts/send-test-emails.ts you@example.com
```

Sends all four through Resend with fixture values, so they can be read in a real client rather than
a browser. Requires `RESEND_API_KEY` and `ACCOUNT_EMAIL_FROM` in `apps/web/.env.local`. The Supabase
three are rendered with their Go expressions substituted for sample values — what arrives is what a
creator would see, not the template source.

## Why there are no images

No brandmark file, no icons, no tracking pixel. Images are blocked by default in a large share of
clients; they need hosting that has to outlive the email; and a remote pixel is precisely the
open-tracking the 2026-07-26 delivery-tracking decision refused for guests. The wordmark is styled
text, and it renders everywhere.
