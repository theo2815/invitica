import { NextResponse } from "next/server";

import { createClient } from "../../../src/lib/supabase/server";
import { getSiteOrigin } from "../../../src/server/auth/redirects";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const supabase = await createClient();
  await supabase.auth.signOut();

  const loginUrl = new URL("/login", getSiteOrigin());
  if (requestUrl.searchParams.get("reason") === "confirmation") {
    loginUrl.searchParams.set("error", "confirmation");
  }

  return NextResponse.redirect(loginUrl);
}
