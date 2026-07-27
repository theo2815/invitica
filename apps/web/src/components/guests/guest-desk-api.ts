import type { z } from "zod";

import {
  type GuestPartyPageRequest,
  guestPartyPageResponseSchema,
  type PrepareGuestInvitationCopiesRequest,
  prepareGuestInvitationCopiesResponseSchema,
  recordGuestInvitationCopyResponseSchema,
} from "../../contracts/guest-desk-api";
import type { GuestPartyPage } from "../../server/guests/guests";

async function postJson<T>(
  path: string,
  input: unknown,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    body: JSON.stringify(input),
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST",
    referrerPolicy: "no-referrer",
    ...(signal ? { signal } : {}),
  });
  const body: unknown = await response.json();
  return schema.parse(body);
}

export function fetchGuestPartyPage(
  input: GuestPartyPageRequest,
  signal?: AbortSignal,
): Promise<{ page: GuestPartyPage; status: "ready" } | { message: string; status: "error" }> {
  return postJson("/api/creator/guest-desk/page", input, guestPartyPageResponseSchema, signal);
}

export function fetchPreparedGuestInvitationCopies(
  input: PrepareGuestInvitationCopiesRequest,
  signal?: AbortSignal,
) {
  return postJson(
    "/api/creator/guest-desk/copies",
    input,
    prepareGuestInvitationCopiesResponseSchema,
    signal,
  );
}

export function recordGuestInvitationCopy(guestPartyId: string) {
  return postJson(
    "/api/creator/guest-desk/copy",
    { guestPartyId },
    recordGuestInvitationCopyResponseSchema,
  );
}
