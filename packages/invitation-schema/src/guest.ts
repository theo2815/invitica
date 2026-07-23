import { z } from "zod";

import { publicationPublicIdentifierSchema } from "./publication.js";

export const GUEST_LINK_FRAGMENT_KEY = "g";

export const guestLinkTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Guest link token must contain 256 bits of base64url material.");

export const guestContextRequestSchema = z.strictObject({
  publicIdentifier: publicationPublicIdentifierSchema,
  token: guestLinkTokenSchema,
});

export const guestRsvpAttendanceSchema = z.enum(["attending", "declined"]);

export const guestRsvpResponseSchema = z.strictObject({
  attendance: guestRsvpAttendanceSchema,
  attendeeCount: z.number().int().min(0).max(50),
  message: z.string().trim().min(1).max(500).nullable(),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const guestRsvpContextSchema = z.strictObject({
  capacity: z.number().int().min(1).max(50),
  deadline: z.string().datetime({ offset: true }).nullable(),
  response: guestRsvpResponseSchema.nullable(),
  status: z.enum(["open", "closed", "unavailable"]),
});

export const guestContextResponseSchema = z.strictObject({
  recipientName: z.string().trim().min(1).max(120),
  rsvp: guestRsvpContextSchema,
});

export const guestRsvpMutationResponseSchema = z.strictObject({
  response: guestRsvpResponseSchema,
});

export const guestRsvpMutationRequestSchema = z
  .strictObject({
    attendance: guestRsvpAttendanceSchema,
    attendeeCount: z.number().int().min(0).max(50),
    expectedRevision: z.number().int().min(0),
    message: z.string().trim().max(500).optional(),
    mutationId: z.string().uuid(),
    publicIdentifier: publicationPublicIdentifierSchema,
    token: guestLinkTokenSchema,
  })
  .refine((value) => value.attendance !== "attending" || value.attendeeCount >= 1)
  .refine((value) => value.attendance !== "declined" || value.attendeeCount === 0);

export type GuestContextRequest = z.infer<typeof guestContextRequestSchema>;
export type GuestContextResponse = z.infer<typeof guestContextResponseSchema>;
export type GuestRsvpAttendance = z.infer<typeof guestRsvpAttendanceSchema>;
export type GuestRsvpContext = z.infer<typeof guestRsvpContextSchema>;
export type GuestRsvpMutationRequest = z.infer<typeof guestRsvpMutationRequestSchema>;
export type GuestRsvpMutationResponse = z.infer<typeof guestRsvpMutationResponseSchema>;
export type GuestRsvpResponse = z.infer<typeof guestRsvpResponseSchema>;

export function parseGuestContextRequest(value: unknown): GuestContextRequest {
  return guestContextRequestSchema.parse(value);
}

export function parseGuestContextResponse(value: unknown): GuestContextResponse {
  return guestContextResponseSchema.parse(value);
}
