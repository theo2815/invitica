import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createClient } from "../../../src/lib/supabase/server";
import { getSiteOrigin } from "../../../src/server/auth/redirects";

const allowedOtpTypes = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && allowedOtpTypes.has(value as EmailOtpType);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const supabase = await createClient();
  const siteOrigin = getSiteOrigin();

  const verification = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && isEmailOtpType(type)
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing confirmation token") };

  if (!verification.error) {
    const { error: workspaceError } = await supabase.rpc("ensure_personal_workspace");
    if (!workspaceError) {
      return NextResponse.redirect(new URL("/dashboard", siteOrigin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirmation", siteOrigin));
}
