import {
  guestRsvpMutationRequestSchema,
  guestRsvpMutationResponseSchema,
} from "@invitica/invitation-schema";
import { NextResponse } from "next/server";

import { createAdminClient } from "../../../../src/lib/supabase/admin";
import { GuestRsvpPersistenceError, submitGuestRsvp } from "../../../../src/server/guests/rsvps";
import { hashGuestLinkToken } from "../../../../src/server/guests/tokens";

const responseHeaders = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function failure(status: string, httpStatus: number) {
  return NextResponse.json({ status }, { headers: responseHeaders, status: httpStatus });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 2_048) return failure("invalid", 400);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return failure("invalid", 415);
  }

  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 2_048) return failure("invalid", 400);
    input = JSON.parse(body);
  } catch {
    return failure("invalid", 400);
  }

  const parsed = guestRsvpMutationRequestSchema.safeParse(input);
  if (!parsed.success) return failure("invalid", 400);

  try {
    const response = await submitGuestRsvp(
      createAdminClient(),
      parsed.data,
      hashGuestLinkToken(parsed.data.token),
    );
    return NextResponse.json(guestRsvpMutationResponseSchema.parse({ response }), {
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    if (error instanceof GuestRsvpPersistenceError) {
      switch (error.kind) {
        case "closed":
          return failure("closed", 410);
        case "conflict":
          return failure("conflict", 409);
        case "invalid":
          return failure("invalid", 400);
        case "unavailable":
          return failure("unavailable", 404);
        default:
          return failure("unavailable", 503);
      }
    }
    return failure("unavailable", 503);
  }
}
