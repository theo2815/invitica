import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderSupabaseTemplate, SUPABASE_TEMPLATES } from "./supabase-email-templates.ts";

/**
 * Writes the Supabase Auth templates to `apps/web/emails/supabase/`, ready to paste into the
 * Dashboard.
 *
 *   node apps/web/scripts/build-supabase-templates.ts
 *
 * Run it after any change to `email-layout.ts` or `supabase-email-templates.ts`, and paste the
 * result in. Nothing automates the paste: Supabase has no API for auth email templates, so the
 * Dashboard stays the only place these take effect.
 */

const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "emails", "supabase");
mkdirSync(outputDirectory, { recursive: true });

for (const template of SUPABASE_TEMPLATES) {
  const path = join(outputDirectory, `${template.file}.html`);
  writeFileSync(path, `${renderSupabaseTemplate(template)}\n`, "utf8");
  console.log(`${template.dashboardName.padEnd(22)} -> emails/supabase/${template.file}.html`);
}

console.log(`\n${SUPABASE_TEMPLATES.length} templates written. Paste each into Supabase Dashboard`);
console.log("-> Authentication -> Emails -> Templates, matching the name on the left.");
