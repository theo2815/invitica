import { NextResponse } from "next/server";

import {
  guestPartyPageRequestSchema,
  guestPartyPageResponseSchema,
} from "../../../../../src/contracts/guest-desk-api";
import { getOptionalConfirmedUser } from "../../../../../src/server/auth/session";
import { listGuestPartyPage } from "../../../../../src/server/guests/guests";
import { creatorGuestError, creatorGuestResponseHeaders, readJsonRequest } from "../responses";

export async function POST(request: Request) {
  const body = await readJsonRequest(request, 2_048);
  if (!body.ok) return creatorGuestError("This guest-page request is not valid.", 400);

  const parsed = guestPartyPageRequestSchema.safeParse(body.input);
  if (!parsed.success) return creatorGuestError("This guest-page request is not valid.", 400);

  const session = await getOptionalConfirmedUser();
  if (!session) return creatorGuestError("Sign in again to continue.", 401);

  try {
    const page = await listGuestPartyPage(session.supabase, parsed.data.invitationId, parsed.data);
    return NextResponse.json(guestPartyPageResponseSchema.parse({ page, status: "ready" }), {
      headers: creatorGuestResponseHeaders,
    });
  } catch {
    return creatorGuestError(
      "Invitica could not load guest parties. Check your connection and try again.",
      503,
    );
  }
}
