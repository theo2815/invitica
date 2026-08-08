import { NextResponse } from "next/server";

import { createClient } from "../../../src/lib/supabase/server";
import { getSafeNextPath, getSiteOrigin } from "../../../src/server/auth/redirects";
import { getPostAuthLegalRedirect } from "../../../src/server/legal/acceptance";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));
  const siteOrigin = getSiteOrigin();

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const acceptanceRedirect = await getPostAuthLegalRedirect(supabase, data.user.id, next);
      if (acceptanceRedirect) {
        return NextResponse.redirect(new URL(acceptanceRedirect, siteOrigin));
      }

      const { error: workspaceError } = await supabase.rpc("ensure_personal_workspace");
      if (!workspaceError) {
        return NextResponse.redirect(new URL(next, siteOrigin));
      }
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth", siteOrigin));
}
