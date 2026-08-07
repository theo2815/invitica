import { type EmailContent, renderEmailHtml, renderEmailText } from "./email-layout.ts";

/**
 * Long enough to walk to another device and open an inbox; short enough that a stale link dies.
 *
 * It lives here rather than in `deletion.ts` so this module and `email-layout.ts` form a pair that
 * imports nothing else — which is what lets `scripts/send-test-emails.ts` render a real preview on
 * plain Node without dragging in the Supabase admin client and the R2 store. `deletion.ts` reads it
 * back from here, so the enforced expiry and the number in the email cannot disagree.
 */
export const DELETION_LINK_MINUTES = 30;

/**
 * The deletion confirmation email — the only message Invitica sends itself, because Supabase Auth
 * has no deletion email type.
 *
 * It carries **no account details**: no name, no invitation titles, no guest information, no
 * counts. A forwarded copy discloses nothing beyond the fact that someone asked. The consequence
 * list is generic for that reason, where the in-app warning names the creator's actual numbers.
 *
 * The "if this wasn't you" line matters more here than in ordinary transactional mail: this link is
 * one of the two things needed to destroy the account, and the other is a live session.
 */
export function accountDeletionEmail(confirmUrl: string): {
  html: string;
  subject: string;
  text: string;
} {
  const content: EmailContent = {
    action: { href: confirmUrl, label: "Confirm deleting my account" },
    consequences: [
      "Every invitation you have made, published or not.",
      "Every invitation link you have shared stops opening for your guests.",
      "Your guest lists and every reply your guests have sent.",
      "Your saved conversations with Invi.",
    ],
    eyebrow: "Delete account",
    footnote:
      "If you did not ask for this, ignore this email and change your password. Nothing has been deleted, and this link does nothing without access to your signed-in Invitica account.",
    heading: "Confirm you want to delete your account",
    paragraphs: [
      "You asked to delete your Invitica account. Nothing has been deleted yet — this is the confirmation.",
      `The link below works for ${DELETION_LINK_MINUTES} minutes, once, and only while you are signed in to the account you want to delete. This is what it removes, permanently:`,
    ],
    preheader: `Nothing is deleted until you confirm. This link expires in ${DELETION_LINK_MINUTES} minutes.`,
    subject: "Confirm you want to delete your Invitica account",
  };

  return {
    html: renderEmailHtml(content),
    subject: content.subject,
    text: renderEmailText(content),
  };
}
