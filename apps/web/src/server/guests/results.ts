import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const partyRowSchema = z.strictObject({
  capacity: z.number().int().min(1).max(50),
  id: uuidSchema,
  invitation_id: uuidSchema,
});
const responseRowSchema = z.strictObject({
  attendance: z.enum(["attending", "declined"]),
  attendee_count: z.number().int().min(0).max(50),
  guest_party_id: uuidSchema,
  invitation_id: uuidSchema,
  updated_at: z.string().datetime({ offset: true }),
});
const viewRowSchema = z.strictObject({
  invitation_id: uuidSchema,
  last_viewed_at: z.string().datetime({ offset: true }),
  view_count: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export interface InvitationResultSummary {
  readonly attendingGuests: number;
  readonly attendingParties: number;
  readonly awaitingParties: number;
  readonly declinedParties: number;
  readonly guestPartyCount: number;
  readonly invitationId: string;
  readonly lastResponseAt: string | null;
  readonly lastViewedAt: string | null;
  readonly reservedSeats: number;
  readonly viewCount: number;
}

export class GuestResultPersistenceError extends Error {
  constructor() {
    super("Invitation results could not be loaded.");
    this.name = "GuestResultPersistenceError";
  }
}

export function emptyInvitationResultSummary(invitationId: string): InvitationResultSummary {
  return {
    attendingGuests: 0,
    attendingParties: 0,
    awaitingParties: 0,
    declinedParties: 0,
    guestPartyCount: 0,
    invitationId,
    lastResponseAt: null,
    lastViewedAt: null,
    reservedSeats: 0,
    viewCount: 0,
  };
}

function laterTimestamp(current: string | null, candidate: string): string {
  return current === null || Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

export async function listInvitationResultSummaries(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<Record<string, InvitationResultSummary>> {
  const parsedWorkspaceId = uuidSchema.parse(workspaceId);
  const [partiesResponse, rsvpsResponse, viewsResponse] = await Promise.all([
    supabase
      .from("guest_parties")
      .select("id, invitation_id, capacity")
      .eq("workspace_id", parsedWorkspaceId),
    supabase
      .from("rsvp_responses")
      .select("guest_party_id, invitation_id, attendance, attendee_count, updated_at")
      .eq("workspace_id", parsedWorkspaceId),
    supabase
      .from("invitation_view_daily")
      .select("invitation_id, view_count, last_viewed_at")
      .eq("workspace_id", parsedWorkspaceId),
  ]);

  if (partiesResponse.error || rsvpsResponse.error || viewsResponse.error) {
    throw new GuestResultPersistenceError();
  }

  const parties = z.array(partyRowSchema).parse(partiesResponse.data ?? []);
  const responses = z.array(responseRowSchema).parse(rsvpsResponse.data ?? []);
  const views = z.array(viewRowSchema).parse(viewsResponse.data ?? []);
  const responseByParty = new Map(responses.map((response) => [response.guest_party_id, response]));
  const summaries = new Map<string, InvitationResultSummary>();

  for (const party of parties) {
    const current =
      summaries.get(party.invitation_id) ?? emptyInvitationResultSummary(party.invitation_id);
    const response = responseByParty.get(party.id);
    summaries.set(party.invitation_id, {
      ...current,
      attendingGuests:
        current.attendingGuests +
        (response?.attendance === "attending" ? response.attendee_count : 0),
      attendingParties: current.attendingParties + (response?.attendance === "attending" ? 1 : 0),
      awaitingParties: current.awaitingParties + (response ? 0 : 1),
      declinedParties: current.declinedParties + (response?.attendance === "declined" ? 1 : 0),
      guestPartyCount: current.guestPartyCount + 1,
      lastResponseAt: response
        ? laterTimestamp(current.lastResponseAt, response.updated_at)
        : current.lastResponseAt,
      reservedSeats: current.reservedSeats + party.capacity,
    });
  }

  for (const view of views) {
    const current =
      summaries.get(view.invitation_id) ?? emptyInvitationResultSummary(view.invitation_id);
    summaries.set(view.invitation_id, {
      ...current,
      lastViewedAt: laterTimestamp(current.lastViewedAt, view.last_viewed_at),
      viewCount: current.viewCount + view.view_count,
    });
  }

  return Object.fromEntries(summaries);
}
