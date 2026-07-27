import { NextResponse } from "next/server";

import {
  prepareGuestInvitationCopiesRequestSchema,
  prepareGuestInvitationCopiesResponseSchema,
} from "../../../../../src/contracts/guest-desk-api";
import { getOptionalConfirmedUser } from "../../../../../src/server/auth/session";
import {
  buildPersonalizedInvitationUrl,
  getRecoverableGuestLinks,
  loadDeliveredGuestInvitation,
} from "../../../../../src/server/guests/guests";
import { buildPersonalInvitationMessage } from "../../../../../src/server/guests/sharing";
import { decryptGuestLinkToken } from "../../../../../src/server/guests/tokens";
import { creatorGuestError, creatorGuestResponseHeaders, readJsonRequest } from "../responses";

export async function POST(request: Request) {
  const body = await readJsonRequest(request, 4_096);
  if (!body.ok) return creatorGuestError("This invitation copy request is not valid.", 400);

  const parsed = prepareGuestInvitationCopiesRequestSchema.safeParse(body.input);
  if (!parsed.success) {
    return creatorGuestError("This invitation copy request is not valid.", 400);
  }

  const session = await getOptionalConfirmedUser();
  if (!session) return creatorGuestError("Sign in again to continue.", 401);

  try {
    const { data: workspaceId, error: workspaceError } = await session.supabase.rpc(
      "ensure_personal_workspace",
    );
    if (workspaceError || !workspaceId) {
      return creatorGuestError("Your workspace is unavailable. Refresh and try again.", 503);
    }

    const invitation = await loadDeliveredGuestInvitation(
      session.supabase,
      workspaceId,
      parsed.data.invitationId,
    );
    if (!invitation) {
      return creatorGuestError("This published invitation is unavailable.", 404);
    }

    const secrets = await getRecoverableGuestLinks(
      session.supabase,
      invitation.invitationId,
      parsed.data.guestPartyIds,
    );
    const copies = secrets.map((secret) => {
      const personalizedUrl = buildPersonalizedInvitationUrl(
        invitation.genericUrl,
        decryptGuestLinkToken(
          {
            ciphertext: secret.ciphertext,
            keyVersion: secret.keyVersion,
            nonce: secret.nonce,
          },
          secret.linkId,
        ),
      );
      return {
        copyText: buildPersonalInvitationMessage(invitation, secret.recipientName, personalizedUrl),
        guestPartyId: secret.guestPartyId,
        personalizedUrl,
      };
    });

    return NextResponse.json(
      prepareGuestInvitationCopiesResponseSchema.parse({ copies, status: "ready" }),
      { headers: creatorGuestResponseHeaders },
    );
  } catch {
    return creatorGuestError("These private invitations could not be prepared. Try again.", 503);
  }
}
