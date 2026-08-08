import {
  type GuestContextResponse,
  type GuestRsvpMutationRequest,
  type GuestRsvpResponse,
  guestRsvpResponseSchema,
} from "@invitica/invitation-schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const contextRowSchema = z.strictObject({
  can_respond: z.boolean(),
  has_rsvp_section: z.boolean(),
  party_capacity: z.number().int().min(1).max(50),
  recipient_name: z.string().trim().min(1).max(120),
  response_attendance: z.enum(["attending", "declined"]).nullable(),
  response_attendee_count: z.number().int().min(0).max(50).nullable(),
  response_message: z.string().trim().min(1).max(500).nullable(),
  response_revision: z.number().int().positive().nullable(),
  response_updated_at: z.string().datetime({ offset: true }).nullable(),
  rsvp_deadline: z.string().datetime({ offset: true }).nullable(),
});

const mutationRowSchema = z.strictObject({
  response_attendance: z.enum(["attending", "declined"]),
  response_attendee_count: z.number().int().min(0).max(50),
  response_message: z.string().trim().min(1).max(500).nullable(),
  response_revision: z.number().int().positive(),
  response_updated_at: z.string().datetime({ offset: true }),
});

export type GuestRsvpFailureKind = "closed" | "conflict" | "invalid" | "service" | "unavailable";

export class GuestRsvpPersistenceError extends Error {
  readonly kind: GuestRsvpFailureKind;

  constructor(kind: GuestRsvpFailureKind) {
    super("The RSVP request could not be completed.");
    this.name = "GuestRsvpPersistenceError";
    this.kind = kind;
  }
}

function responseFromRow(row: z.infer<typeof mutationRowSchema>): GuestRsvpResponse {
  return guestRsvpResponseSchema.parse({
    attendance: row.response_attendance,
    attendeeCount: row.response_attendee_count,
    message: row.response_message,
    revision: row.response_revision,
    updatedAt: row.response_updated_at,
  });
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function mutationFailure(error: unknown): GuestRsvpPersistenceError {
  switch (errorCode(error)) {
    case "22023":
    case "23514":
      return new GuestRsvpPersistenceError("invalid");
    case "40001":
      return new GuestRsvpPersistenceError("conflict");
    case "P0001":
      return new GuestRsvpPersistenceError("closed");
    case "P0002":
      return new GuestRsvpPersistenceError("unavailable");
    default:
      return new GuestRsvpPersistenceError("service");
  }
}

export async function resolveGuestRsvpContext(
  supabase: SupabaseClient,
  publicIdentifier: string,
  tokenHash: string,
): Promise<GuestContextResponse | null> {
  const { data, error } = await supabase.rpc("resolve_guest_rsvp_context", {
    p_public_identifier: publicIdentifier,
    p_token_hash: tokenHash,
  });
  if (error) throw new GuestRsvpPersistenceError("service");

  const row = z.array(contextRowSchema).parse(data ?? [])[0];
  if (!row) return null;

  const {
    response_attendance,
    response_attendee_count,
    response_message,
    response_revision,
    response_updated_at,
  } = row;
  const response =
    response_attendance !== null &&
    response_attendee_count !== null &&
    response_revision !== null &&
    response_updated_at !== null
      ? responseFromRow({
          response_attendance,
          response_attendee_count,
          response_message,
          response_revision,
          response_updated_at,
        })
      : null;

  return {
    recipientName: row.recipient_name,
    rsvp: {
      capacity: row.party_capacity,
      deadline: row.rsvp_deadline,
      response,
      status: !row.has_rsvp_section ? "unavailable" : row.can_respond ? "open" : "closed",
    },
  };
}

export async function submitGuestRsvp(
  supabase: SupabaseClient,
  input: GuestRsvpMutationRequest,
  tokenHash: string,
): Promise<GuestRsvpResponse> {
  const { data, error } = await supabase.rpc("submit_guest_rsvp", {
    p_attendance: input.attendance,
    p_attendee_count: input.attendeeCount,
    p_expected_revision: input.expectedRevision,
    p_message: input.message ?? null,
    p_mutation_id: input.mutationId,
    p_public_identifier: input.publicIdentifier,
    p_token_hash: tokenHash,
  });
  if (error) throw mutationFailure(error);

  const row = z.array(mutationRowSchema).parse(data ?? [])[0];
  if (!row) throw new GuestRsvpPersistenceError("service");
  return responseFromRow(row);
}
