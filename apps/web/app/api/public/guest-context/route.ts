import { guestContextRequestSchema, guestContextResponseSchema } from "@invitica/invitation-schema";
import { NextResponse } from "next/server";

import { createAdminClient } from "../../../../src/lib/supabase/admin";
import { resolveGuestRsvpContext } from "../../../../src/server/guests/rsvps";
import { consumePublicRequest } from "../../../../src/server/guests/throttle";
import { hashGuestLinkToken } from "../../../../src/server/guests/tokens";

const responseHeaders = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function unavailable(status = 404) {
  return NextResponse.json({ status: "unavailable" }, { headers: responseHeaders, status });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 2_048) return unavailable(400);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return unavailable(415);
  }

  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 2_048) return unavailable(400);
    input = JSON.parse(body);
  } catch {
    return unavailable(400);
  }

  const parsed = guestContextRequestSchema.safeParse(input);
  if (!parsed.success) return unavailable();

  try {
    const supabase = createAdminClient();
    if (!(await consumePublicRequest(supabase, "guest-context", request))) {
      return unavailable(429);
    }

    const context = await resolveGuestRsvpContext(
      supabase,
      parsed.data.publicIdentifier,
      hashGuestLinkToken(parsed.data.token),
    );
    if (!context) return unavailable();
    return NextResponse.json(guestContextResponseSchema.parse(context), {
      headers: responseHeaders,
    });
  } catch {
    return unavailable(503);
  }
}
