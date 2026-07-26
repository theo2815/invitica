import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "../../../../src/lib/supabase/admin";
import { consumePublicRequest } from "../../../../src/server/guests/throttle";
import { recordInvitationView } from "../../../../src/server/guests/views";

const requestSchema = z.strictObject({
  publicIdentifier: z.string().regex(/^[0-9a-f]{32}$/),
});
const responseHeaders = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function accepted() {
  return new NextResponse(null, { headers: responseHeaders, status: 204 });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 256) return accepted();
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return accepted();
  }

  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 256) return accepted();
    input = JSON.parse(body);
  } catch {
    return accepted();
  }

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return accepted();

  try {
    const supabase = createAdminClient();
    // Over budget simply stops counting. The contract stays "always 204" so a guest
    // page never changes behaviour over view measurement.
    if (await consumePublicRequest(supabase, "view", request)) {
      await recordInvitationView(supabase, parsed.data.publicIdentifier);
    }
  } catch {
    // View measurement is deliberately best effort and never affects invitation reading.
  }
  return accepted();
}
