/**
 * Warm Editorial, in the one medium that cannot have a design system.
 *
 * Every Invitica email is built here — the deletion link this app sends itself, and the Supabase
 * Auth templates, which are generated from this same shell by
 * `apps/web/scripts/build-supabase-templates.ts` and pasted into the Supabase Dashboard. That
 * generator is why this file exists: two hand-maintained copies of a brand drift, and half of them
 * would live in a web form nobody diffs.
 *
 * Email constraints this obeys, all of them deliberate:
 *
 * - **Tables, not flexbox.** Outlook renders through Word's HTML engine.
 * - **Inline styles only.** Gmail strips `<style>` blocks in some contexts and all of them in the
 *   clipped-message view.
 * - **No images at all.** No brandmark PNG, no tracking pixel, no icons. Images are blocked by
 *   default in a large share of clients, they need hosting that must outlive the email, and a
 *   remote pixel is exactly the tracking the 2026-07-26 minimal-tracking decision refused. The
 *   wordmark is styled text.
 * - **Georgia for display type.** Fraunces cannot load in email; Georgia is already the app's
 *   declared fallback in `--display-font`, so the family degrades the way the product intends.
 * - **600 px.** The width every client has agreed on for twenty years.
 * - **A preheader.** Without one, inboxes preview the first visible words, which is the wordmark.
 */

/** The palette, hard-coded because email has no custom properties. Matches `globals.css :root`. */
const PALETTE = {
  accent: "#7a3442",
  accentText: "#ffffff",
  border: "#d5cbbd",
  ink: "#29231f",
  muted: "#6d655e",
  page: "#f7f3eb",
  surface: "#fffdf8",
} as const;

const SANS = "'Instrument Sans','Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

/**
 * A value that is either plain text to escape, or markup already known to be safe — which is how a
 * Supabase Go expression such as `{{ .Token }}` reaches the output intact. See `raw()`.
 */
export type EmailText = string | { __html: string };

export interface EmailAction {
  href: EmailText;
  label: EmailText;
}

export interface EmailContent {
  /** Uppercase kicker above the heading. Short — it is the first thing read. */
  eyebrow: string;
  /** The display heading. One line where possible. Plain, because the text part upper-cases it. */
  heading: string;
  /** Body paragraphs, rendered in order. */
  paragraphs: EmailText[];
  /** Optional primary button. */
  action?: EmailAction | undefined;
  /** Optional six-digit code, shown as the primary element instead of a button. */
  code?: EmailText | undefined;
  /** Consequence list, rendered in a bordered accent-edged block. */
  consequences?: EmailText[] | undefined;
  /** Closing note in muted type — what to do if this was not you. */
  footnote?: string | undefined;
  /** Inbox preview line. Never rendered visibly. */
  preheader: string;
  /** Subject line. Carried here so one object describes the whole message. */
  subject: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Supabase templates carry Go expressions like `{{ .Token }}` that must survive into the output
 * unescaped, while everything around them is still escaped. Wrapping a value in this marks it as
 * already-safe markup.
 */
export function raw(value: string): { __html: string } {
  return { __html: value };
}

function text(value: EmailText): string {
  return typeof value === "string" ? escapeHtml(value) : value.__html;
}

function paragraph(value: EmailText): string {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.65;color:${PALETTE.ink}">${text(value)}</p>`;
}

function button(action: EmailAction): string {
  // A padded table cell rather than a styled anchor: Outlook ignores padding on inline elements,
  // so a bare <a> collapses to underlined text with no button around it.
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">
          <tr>
            <td align="center" bgcolor="${PALETTE.accent}" style="border-radius:6px">
              <a href="${text(action.href)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;font-weight:700;color:${PALETTE.accentText};text-decoration:none;border-radius:6px">${text(action.label)}</a>
            </td>
          </tr>
        </table>`;
}

function codeBlock(code: EmailText): string {
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 4px">
          <tr>
            <td align="center" style="padding:20px 16px;background-color:${PALETTE.page};border:1px solid ${PALETTE.border};border-radius:6px">
              <div style="font-family:${SANS};font-size:32px;font-weight:700;letter-spacing:10px;color:${PALETTE.accent};text-indent:10px">${text(code)}</div>
            </td>
          </tr>
        </table>`;
}

function consequenceBlock(items: EmailText[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:0 0 8px;font-family:${SANS};font-size:14px;line-height:1.55;color:${PALETTE.ink}">&bull;&nbsp;&nbsp;${text(item)}</td></tr>`,
    )
    .join("");

  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px">
          <tr>
            <td style="padding:16px 18px;background-color:${PALETTE.page};border-left:3px solid ${PALETTE.accent};border-radius:4px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
            </td>
          </tr>
        </table>`;
}

export function renderEmailHtml(content: EmailContent): string {
  const body = [
    ...content.paragraphs.map(paragraph),
    content.code ? codeBlock(content.code) : "",
    content.consequences?.length ? consequenceBlock(content.consequences) : "",
    content.action ? button(content.action) : "",
  ]
    .filter(Boolean)
    .join("\n");

  const footnote = content.footnote
    ? `<p style="margin:20px 0 0;padding-top:20px;border-top:1px solid ${PALETTE.border};font-family:${SANS};font-size:13px;line-height:1.6;color:${PALETTE.muted}">${text(content.footnote)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${text(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PALETTE.page}">
<!-- Preheader: the inbox preview line. Zero-height and transparent, then padded with a run of
     entities so the client does not pull the wordmark in after it. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0">${text(content.preheader)}&#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${PALETTE.page}">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px">

        <tr>
          <td style="padding:0 4px 20px">
            <span style="font-family:${SERIF};font-size:22px;font-weight:700;letter-spacing:-0.5px;color:${PALETTE.ink}"><span style="color:${PALETTE.accent}">I</span>nvitica</span>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 32px 28px;background-color:${PALETTE.surface};border:1px solid ${PALETTE.border};border-radius:8px">
            <p style="margin:0 0 10px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${PALETTE.accent}">${text(content.eyebrow)}</p>
            <h1 style="margin:0 0 18px;font-family:${SERIF};font-size:28px;font-weight:400;line-height:1.2;color:${PALETTE.ink}">${text(content.heading)}</h1>
${body}
${footnote}
          </td>
        </tr>

        <tr>
          <td style="padding:20px 4px 0">
            <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${PALETTE.muted}">Invitica &middot; premium digital invitations, made in the Philippines<br>This message was sent to you because someone used this address on invitica.app.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * The plain-text part, which is not optional. A message with no `text/plain` alternative scores
 * badly with spam filters and is unreadable in a text-only client.
 */
export function renderEmailText(content: EmailContent): string {
  const plain = (value: EmailText) =>
    (typeof value === "string" ? value : value.__html)
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');

  const lines: string[] = ["INVITICA", "", content.heading.toUpperCase(), ""];

  for (const value of content.paragraphs) lines.push(plain(value), "");
  if (content.code) lines.push(`Your code: ${plain(content.code)}`, "");
  if (content.consequences?.length) {
    for (const item of content.consequences) lines.push(`- ${plain(item)}`);
    lines.push("");
  }
  if (content.action) lines.push(`${plain(content.action.label)}:`, plain(content.action.href), "");
  if (content.footnote) lines.push(plain(content.footnote), "");

  lines.push("--", "Invitica - premium digital invitations, made in the Philippines");

  return lines.join("\n");
}
