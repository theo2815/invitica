import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { accountDeletionEmail } from "../src/server/account/deletion-email.ts";
import { renderEmailText } from "../src/server/account/email-layout.ts";
import { renderSupabaseTemplate, SUPABASE_TEMPLATES } from "./supabase-email-templates.ts";

/**
 * Sends every Invitica email to one address, so they can be read in a real client.
 *
 *   node apps/web/scripts/send-test-emails.ts someone@example.com
 *
 * The three Supabase templates are rendered here with their Go expressions replaced by fixture
 * values, so what arrives is what a creator would actually receive rather than template source.
 * **Supabase is not involved** — this proves the templates and the Resend credentials, not the
 * Dashboard configuration. Sending a real recovery code through Supabase is a separate check, and
 * the README says how.
 *
 * Reads `RESEND_API_KEY` and `ACCOUNT_EMAIL_FROM` from `apps/web/.env.local`. Neither is printed.
 */

const here = dirname(fileURLToPath(import.meta.url));

function readEnvLocal(): Record<string, string> {
  const values: Record<string, string> = {};
  let file: string;

  try {
    file = readFileSync(join(here, "..", ".env.local"), "utf8");
  } catch {
    return values;
  }

  for (const line of file.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match?.[1]) continue;
    values[match[1]] = (match[2] ?? "").replace(/^["']|["']$/g, "");
  }

  return values;
}

/** Fixture substitutions for the Go expressions Supabase would fill in at send time. */
const FIXTURES: Record<string, string> = {
  "{{ .ConfirmationURL }}": "https://invitica.app/auth/confirm?token_hash=sample&type=email",
  "{{ .Email }}": "maria.santos@example.com",
  "{{ .NewEmail }}": "maria@example.com",
  "{{ .Token }}": "418620",
};

function substitute(value: string): string {
  return Object.entries(FIXTURES).reduce(
    (carried, [expression, fixture]) => carried.split(expression).join(fixture),
    value,
  );
}

const recipient = process.argv[2];

if (!recipient || !recipient.includes("@")) {
  console.error("Usage: node apps/web/scripts/send-test-emails.ts someone@example.com");
  process.exit(1);
}

const environment = { ...readEnvLocal(), ...process.env };
const apiKey = environment.RESEND_API_KEY;
const from = environment.ACCOUNT_EMAIL_FROM;

if (!apiKey || !from) {
  console.error("RESEND_API_KEY and ACCOUNT_EMAIL_FROM must be set in apps/web/.env.local.");
  process.exit(1);
}

interface Message {
  html: string;
  label: string;
  subject: string;
  text: string;
}

const deletion = accountDeletionEmail(
  "https://invitica.app/account/delete/confirm?token=sample-token-for-preview",
);

const messages: Message[] = [
  ...SUPABASE_TEMPLATES.map((template) => ({
    html: substitute(renderSupabaseTemplate(template)),
    label: `${template.dashboardName} (Supabase)`,
    subject: `[TEST] ${substitute(template.content.subject)}`,
    text: substitute(renderEmailText(template.content)),
  })),
  {
    html: deletion.html,
    label: "Account deletion (Invitica)",
    subject: `[TEST] ${deletion.subject}`,
    text: deletion.text,
  },
];

let failures = 0;

for (const message of messages) {
  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from,
      html: message.html,
      subject: message.subject,
      text: message.text,
      to: [recipient],
    }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST",
  });

  if (response.ok) {
    const body = (await response.json()) as { id?: string };
    console.log(`sent    ${message.label.padEnd(30)} id=${body.id ?? "unknown"}`);
  } else {
    failures += 1;
    // Resend's error body names the failing field but not the key, so it is safe to show.
    console.error(
      `FAILED  ${message.label.padEnd(30)} ${response.status} ${await response.text()}`,
    );
  }

  // Resend's default rate limit is 2 requests/second.
  await new Promise((resolve) => setTimeout(resolve, 600));
}

console.log(`\n${messages.length - failures}/${messages.length} sent to ${recipient}.`);
process.exit(failures > 0 ? 1 : 0);
