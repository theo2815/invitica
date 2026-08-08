/**
 * The one transactional email Invitica sends itself.
 *
 * Everything else — sign-up confirmation, password recovery, the email-change links — is sent by
 * Supabase Auth through its own SMTP provider. Account deletion is not one of Supabase's email
 * types, so it has nowhere else to come from.
 *
 * No SDK. Sending is a single POST, and `AGENTS.md` is explicit that a provider integration
 * belongs behind a narrow interface rather than behind a dependency when a few lines are clearer.
 * `sendEmail` is that interface: swapping providers means rewriting this file and nothing else.
 */

export interface OutboundEmail {
  html: string;
  subject: string;
  text: string;
  to: string;
}

export class EmailDeliveryError extends Error {
  constructor() {
    super("The email could not be sent.");
    this.name = "EmailDeliveryError";
  }
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** A send that hangs must not hold a server action open indefinitely. */
const SEND_TIMEOUT_MS = 10_000;

export function emailSendingConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ACCOUNT_EMAIL_FROM);
}

export async function sendEmail(message: OutboundEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ACCOUNT_EMAIL_FROM;

  if (!apiKey || !from) {
    throw new EmailDeliveryError();
  }

  let response: Response;

  try {
    response = await fetch(RESEND_ENDPOINT, {
      body: JSON.stringify({
        from,
        html: message.html,
        subject: message.subject,
        text: message.text,
        to: [message.to],
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    // The provider's own message is deliberately not surfaced or logged: it echoes the recipient
    // address back, and `AGENTS.md` keeps addresses out of logs.
    throw new EmailDeliveryError();
  }

  if (!response.ok) {
    throw new EmailDeliveryError();
  }
}
