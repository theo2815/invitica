import { z } from "zod";

/**
 * What one guest party may contain, as `createGuestPartiesAction` accepts it.
 *
 * It lives here rather than in `actions.ts` because that file is `"use server"`, where every
 * export must be an async function — a schema cannot be exported from it at all. Moving it
 * out is what lets the assistant's guest-list parser validate against the *same* object the
 * action validates against, rather than a copy of it that drifts the first time a bound
 * changes.
 */
export const guestNamesSchema = z.array(z.string().trim().min(1).max(120)).max(50);

export const guestPartyInputSchema = z
  .strictObject({
    capacity: z.number().int().min(1).max(50),
    guestNames: guestNamesSchema,
    internalLabel: z.string().trim().min(1).max(120),
    recipientName: z.string().trim().min(1).max(120),
  })
  .superRefine((value, context) => {
    if (value.guestNames.length > value.capacity) {
      context.addIssue({
        code: "custom",
        message: "Named guests cannot exceed the party capacity.",
        path: ["guestNames"],
      });
    }
  });

export type GuestPartyInput = z.infer<typeof guestPartyInputSchema>;
