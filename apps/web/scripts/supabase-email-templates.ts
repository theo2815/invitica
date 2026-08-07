import { type EmailContent, raw, renderEmailHtml } from "../src/server/account/email-layout.ts";

/**
 * The Supabase Auth email templates, authored here and pasted into the Supabase Dashboard.
 *
 * They are built from the same `email-layout` shell as the deletion email Invitica sends itself, so
 * a creator meets one brand across all of them. The Dashboard is the only place these can actually
 * run, and it is a web form nobody diffs — this file is the source of truth, and
 * `apps/web/emails/supabase/*.html` is its checked-in output.
 *
 * `raw()` marks the Go expressions Supabase substitutes at send time, so they survive escaping:
 *
 * - `{{ .Token }}` — the six-digit code
 * - `{{ .ConfirmationURL }}` — the full verification link, including the `emailRedirectTo` the app
 *   passed, which is why it is preferred over hand-building a `{{ .TokenHash }}` URL: rebuilding it
 *   would drop the `next` path and land a confirmed creator on the landing page
 * - `{{ .Email }}` / `{{ .NewEmail }}` — the addresses, on the email-change templates only
 */

export interface SupabaseTemplate {
  /** Dashboard → Authentication → Emails → Templates, by its name there. */
  dashboardName: string;
  /** Output file stem. */
  file: string;
  content: EmailContent;
  /** What the template must contain for the app's flow to work at all. */
  contract: string;
}

export const SUPABASE_TEMPLATES: SupabaseTemplate[] = [
  {
    contract:
      "MUST contain {{ .Token }}. Invitica verifies recovery with verifyOtp({ type: 'recovery' }) and its UI asks for a six-digit code — the stock template ships a {{ .ConfirmationURL }} link, which sends a creator a link while the app asks for a code.",
    dashboardName: "Reset Password",
    file: "reset-password",
    content: {
      code: raw("{{ .Token }}"),
      eyebrow: "Password recovery",
      footnote:
        "If you did not ask to reset your password, ignore this email. Your password stays as it is, and nobody can change it without this code.",
      heading: "Your password recovery code",
      paragraphs: ["Enter this code on the Invitica recovery page to choose a new password."],
      preheader: "Your six-digit Invitica recovery code.",
      subject: "Your Invitica password recovery code",
    },
  },
  {
    contract:
      "MUST use {{ .ConfirmationURL }} rather than a hand-built URL, so the `next` path from signUpWithEmail's emailRedirectTo survives and the creator lands where they were going.",
    dashboardName: "Confirm signup",
    file: "confirm-signup",
    content: {
      action: { href: "{{ .ConfirmationURL }}", label: "Confirm my email address" },
      eyebrow: "Welcome",
      footnote:
        "If you did not create an Invitica account, ignore this email and no account will be made.",
      heading: "Confirm your email address",
      paragraphs: [
        "You are one click from your Invitica workspace. Confirm this address and we will take you straight there.",
        "This link can only be used once.",
      ],
      preheader: "Confirm your address and your Invitica workspace is ready.",
      subject: "Confirm your Invitica email address",
    },
  },
  {
    contract:
      "Sent to BOTH the old and the new address while Supabase's Secure Email Change is on. The address changes only after both are confirmed, so the wording must not claim it has already moved.",
    dashboardName: "Change Email Address",
    file: "change-email",
    content: {
      action: { href: "{{ .ConfirmationURL }}", label: "Confirm this change" },
      eyebrow: "Email address",
      footnote:
        "If you did not ask to change your Invitica email address, ignore this email and change your password. The address does not change unless both inboxes confirm it.",
      heading: "Confirm your new email address",
      paragraphs: [
        raw(
          "You asked to change the email address on your Invitica account from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>.",
        ),
        "For your security we sent this to both addresses, and the change only happens once both have confirmed. Until then you keep signing in with your current address.",
      ],
      preheader: "Confirm from both inboxes to finish changing your Invitica address.",
      subject: "Confirm your new Invitica email address",
    },
  },
];

export function renderSupabaseTemplate(template: SupabaseTemplate): string {
  return renderEmailHtml(template.content);
}
