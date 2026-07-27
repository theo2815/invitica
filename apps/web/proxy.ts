import type { NextRequest } from "next/server";

import { updateSession } from "./src/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Branding assets carry no session: `manifest.webmanifest` and `.ico` join the existing
  // exclusions so a favicon or install-manifest fetch never spends a Supabase session refresh.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
