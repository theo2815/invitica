import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

export const guestPartyResponseFilterSchema = z.enum([
  "all",
  "already-sent",
  "attending",
  "awaiting",
  "declined",
  "not-yet-sent",
]);

export const guestPartySummarySchema = z.strictObject({
  archivedAt: timestampSchema.nullable(),
  capacity: z.number().int().min(1).max(50),
  copyCount: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  firstCopiedAt: timestampSchema.nullable(),
  guestMembers: z.array(
    z.strictObject({
      id: uuidSchema,
      name: z.string().trim().min(1).max(120),
    }),
  ),
  id: uuidSchema,
  internalLabel: z.string().trim().min(1).max(120),
  lastCopiedAt: timestampSchema.nullable(),
  linkStatus: z.enum(["active", "revoked"]),
  markedSentAt: timestampSchema.nullable(),
  recipientName: z.string().trim().min(1).max(120),
  response: z
    .strictObject({
      attendance: z.enum(["attending", "declined"]),
      attendeeCount: z.number().int().min(0).max(50),
      message: z.string().trim().min(1).max(500).nullable(),
      updatedAt: timestampSchema,
    })
    .nullable(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const guestPartyPageSchema = z.strictObject({
  hasMore: z.boolean(),
  nextOffset: z.number().int().nonnegative(),
  parties: z.array(guestPartySummarySchema).max(20),
});

export const guestPartyPageRequestSchema = z.strictObject({
  invitationId: uuidSchema,
  offset: z.number().int().nonnegative().max(1_000_000),
  query: z.string().trim().max(120),
  responseFilter: guestPartyResponseFilterSchema,
});

export const guestPartyPageResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ page: guestPartyPageSchema, status: z.literal("ready") }),
  z.strictObject({ message: z.string().min(1).max(240), status: z.literal("error") }),
]);

export const preparedGuestInvitationCopySchema = z.strictObject({
  copyText: z.string().min(1).max(4_096),
  guestPartyId: uuidSchema,
  personalizedUrl: z.url(),
});

export const prepareGuestInvitationCopiesRequestSchema = z.strictObject({
  guestPartyIds: z.array(uuidSchema).min(1).max(50),
  invitationId: uuidSchema,
});

export const prepareGuestInvitationCopiesResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    copies: z.array(preparedGuestInvitationCopySchema).max(50),
    status: z.literal("ready"),
  }),
  z.strictObject({ message: z.string().min(1).max(240), status: z.literal("error") }),
]);

export const recordGuestInvitationCopyRequestSchema = z.strictObject({
  guestPartyId: uuidSchema,
});

export const recordGuestInvitationCopyResponseSchema = z.strictObject({
  status: z.enum(["ignored", "recorded"]),
});

export type GuestPartyPageRequest = z.infer<typeof guestPartyPageRequestSchema>;
export type PrepareGuestInvitationCopiesRequest = z.infer<
  typeof prepareGuestInvitationCopiesRequestSchema
>;
