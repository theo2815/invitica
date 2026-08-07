import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderSupabaseTemplate, SUPABASE_TEMPLATES } from "../scripts/supabase-email-templates";
import { accountDeletionEmail } from "../src/server/account/deletion-email";
import {
  escapeHtml,
  raw,
  renderEmailHtml,
  renderEmailText,
} from "../src/server/account/email-layout";

const templatesByName = new Map(SUPABASE_TEMPLATES.map((t) => [t.dashboardName, t]));

function readCheckedIn(file: string): string {
  return readFileSync(
    join(import.meta.dirname, "..", "emails", "supabase", `${file}.html`),
    "utf8",
  );
}

describe("the Supabase reset-password template", () => {
  /**
   * The one contract that breaks password recovery outright. Invitica verifies with
   * `verifyOtp({ type: "recovery" })` and its UI asks for a six-digit code; Supabase's stock
   * template ships a `{{ .ConfirmationURL }}` link instead, which would send a creator a link
   * while the app asks for a code that was never in the email.
   */
  it("carries the six-digit token and not a confirmation link", () => {
    const template = templatesByName.get("Reset Password");
    if (!template) throw new Error("Expected a Reset Password template.");

    const html = renderSupabaseTemplate(template);

    expect(html).toContain("{{ .Token }}");
    expect(html).not.toContain("{{ .ConfirmationURL }}");
  });
});

describe("the Supabase confirmation templates", () => {
  /**
   * `{{ .ConfirmationURL }}` folds in the `emailRedirectTo` the app passed. Hand-building a
   * `{{ .TokenHash }}` URL would drop the `next` path and land a confirmed creator on the public
   * landing page instead of where they were going.
   */
  it.each(["Confirm signup", "Change Email Address"])("%s uses ConfirmationURL", (name) => {
    const template = templatesByName.get(name);
    if (!template) throw new Error(`Expected a ${name} template.`);

    const html = renderSupabaseTemplate(template);

    expect(html).toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("{{ .TokenHash }}");
  });

  it("names both addresses on the email-change template, unescaped", () => {
    const template = templatesByName.get("Change Email Address");
    if (!template) throw new Error("Expected a Change Email Address template.");

    const html = renderSupabaseTemplate(template);

    expect(html).toContain("{{ .Email }}");
    expect(html).toContain("{{ .NewEmail }}");
    // The address has not moved yet; claiming otherwise strands a creator on the wrong inbox.
    expect(html).toContain("both have confirmed");
  });
});

describe("the checked-in Supabase files", () => {
  /**
   * `emails/supabase/*.html` is generated output, and it is what gets pasted into a Dashboard that
   * nothing else diffs. A stale file is a template nobody notices is wrong.
   */
  it.each(
    SUPABASE_TEMPLATES.map((t) => [t.file, t] as const),
  )("%s.html matches the generator", (_file, template) => {
    expect(readCheckedIn(template.file)).toBe(`${renderSupabaseTemplate(template)}\n`);
  });
});

describe("the shared email shell", () => {
  it("escapes plain values and passes raw markup through", () => {
    const html = renderEmailHtml({
      eyebrow: "Test",
      heading: "Heading",
      paragraphs: ['5 > 3 & "quoted"', raw("<strong>{{ .Email }}</strong>")],
      preheader: "Preview",
      subject: "Subject",
    });

    expect(html).toContain("5 &gt; 3 &amp; &quot;quoted&quot;");
    expect(html).toContain("<strong>{{ .Email }}</strong>");
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("ships no remote images, so nothing is blocked and nothing tracks", () => {
    for (const template of SUPABASE_TEMPLATES) {
      const html = renderSupabaseTemplate(template);
      expect(html).not.toMatch(/<img/i);
      expect(html).not.toMatch(/background-image/i);
    }

    expect(accountDeletionEmail("https://invitica.app/x").html).not.toMatch(/<img/i);
  });

  it("always produces a plain-text alternative carrying the same action", () => {
    const deletion = accountDeletionEmail("https://invitica.app/account/delete/confirm?token=abc");

    expect(deletion.text).toContain("https://invitica.app/account/delete/confirm?token=abc");
    expect(deletion.text).toContain("INVITICA");

    const recovery = templatesByName.get("Reset Password");
    if (!recovery) throw new Error("Expected a Reset Password template.");
    expect(renderEmailText(recovery.content)).toContain("{{ .Token }}");
  });
});

describe("the account deletion email", () => {
  /** A forwarded copy must disclose nothing about the account beyond that someone asked. */
  it("carries no account detail and says nothing is deleted yet", () => {
    const { html, subject, text } = accountDeletionEmail("https://invitica.app/x?token=t");

    expect(html).toContain("Nothing has been deleted yet");
    expect(html).toContain("only while you are signed in");
    expect(subject).toContain("delete your Invitica account");
    expect(text).toContain("If you did not ask for this");
    // No counts, no names, no invitation titles.
    expect(html).not.toMatch(/\b\d+ invitations?\b/);
  });
});
