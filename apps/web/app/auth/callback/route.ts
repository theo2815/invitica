import { NextResponse } from "next/server";

import { createClient } from "../../../src/lib/supabase/server";
import { getSafeNextPath, getSiteOrigin } from "../../../src/server/auth/redirects";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));
  const siteOrigin = getSiteOrigin();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { error: workspaceError } = await supabase.rpc("ensure_personal_workspace");
      if (!workspaceError) {
        return NextResponse.redirect(new URL(next, siteOrigin));
      }
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth", siteOrigin));
}
