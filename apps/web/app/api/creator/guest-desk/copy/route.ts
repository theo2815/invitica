import { NextResponse } from "next/server";

import {
  recordGuestInvitationCopyRequestSchema,
  recordGuestInvitationCopyResponseSchema,
} from "../../../../../src/contracts/guest-desk-api";
import { getOptionalConfirmedUser } from "../../../../../src/server/auth/session";
import { recordGuestInvitationCopy } from "../../../../../src/server/guests/guests";
import { creatorGuestResponseHeaders, readJsonRequest } from "../responses";

function ignored() {
  return NextResponse.json(recordGuestInvitationCopyResponseSchema.parse({ status: "ignored" }), {
    headers: creatorGuestResponseHeaders,
  });
}

export async function POST(request: Request) {
  const body = await readJsonRequest(request, 512);
  if (!body.ok) return ignored();

  const parsed = recordGuestInvitationCopyRequestSchema.safeParse(body.input);
  if (!parsed.success) return ignored();

  const session = await getOptionalConfirmedUser();
  if (!session) return ignored();

  try {
    await recordGuestInvitationCopy(session.supabase, parsed.data.guestPartyId);
    return NextResponse.json(
      recordGuestInvitationCopyResponseSchema.parse({ status: "recorded" }),
      { headers: creatorGuestResponseHeaders },
    );
  } catch {
    return ignored();
  }
}
