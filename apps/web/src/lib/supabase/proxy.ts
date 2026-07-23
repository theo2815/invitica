import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getSafeNextPath } from "../../server/auth/redirects";
import { getSupabaseConfig } from "./config";

const protectedPrefixes = ["/dashboard"] as const;
const authPaths = new Set(["/login", "/register"]);

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { publishableKey, url } = getSupabaseConfig();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, options, value } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!claims && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (claims && authPaths.has(pathname)) {
    const dashboardUrl = request.nextUrl.clone();
    const next = new URL(
      getSafeNextPath(request.nextUrl.searchParams.get("next")),
      request.nextUrl.origin,
    );
    dashboardUrl.pathname = next.pathname;
    dashboardUrl.search = next.search;
    dashboardUrl.hash = next.hash;
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}
