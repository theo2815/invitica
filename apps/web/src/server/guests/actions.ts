"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ensurePersonalWorkspace } from "../auth/session";
import {
  buildPersonalizedInvitationUrl,
  createGuestParty,
  GuestPersistenceError,
  listDeliveredGuestInvitations,
  listGuestParties,
  replaceGuestPartyLink,
  revokeGuestPartyLink,
} from "./guests";
import { generateGuestLinkToken, hashGuestLinkToken } from "./tokens";

const uuidSchema = z.string().uuid();
const guestNamesSchema = z.array(z.string().trim().min(1).max(120)).max(50);
const createGuestPartySchema = z
  .strictObject({
    capacity: z.number().int().min(1).max(50),
    guestNames: guestNamesSchema,
    internalLabel: z.string().trim().min(1).max(120),
    invitationId: uuidSchema,
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
const linkActionSchema = z.strictObject({ guestPartyId: uuidSchema, invitationId: uuidSchema });

export type CreateGuestPartyActionResult =
  | { partyId: string; personalizedUrl: string; status: "created" }
  | { message: string; status: "error" };

export type ReplaceGuestPartyLinkActionResult =
  | { personalizedUrl: string; status: "replaced" }
  | { message: string; status: "error" };

export type RevokeGuestPartyLinkActionResult =
  | { status: "revoked" }
  | { message: string; status: "error" };

async function loadOwnedInvitationContext(invitationId: string): Promise<{
  genericUrl: string;
  invitationId: string;
  publicIdentifier: string;
  title: string;
  supabase: Awaited<ReturnType<typeof ensurePersonalWorkspace>>["supabase"];
  workspaceId: string;
} | null> {
  const { error, supabase, workspaceId } = await ensurePersonalWorkspace();
  if (error || !workspaceId) return null;
  const invitations = await listDeliveredGuestInvitations(supabase, workspaceId);
  const invitation = invitations.find((candidate) => candidate.invitationId === invitationId);
  return invitation ? { ...invitation, supabase, workspaceId } : null;
}

export async function createGuestPartyAction(
  input: unknown,
): Promise<CreateGuestPartyActionResult> {
  const parsed = createGuestPartySchema.safeParse(input);
  if (!parsed.success) {
    return { message: "Check the highlighted party details and try again.", status: "error" };
  }

  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) {
      return {
        message: "This published invitation is unavailable. Refresh and try again.",
        status: "error",
      };
    }

    const token = generateGuestLinkToken();
    const partyId = randomUUID();
    await createGuestParty(context.supabase, {
      capacity: parsed.data.capacity,
      guestNames: parsed.data.guestNames,
      internalLabel: parsed.data.internalLabel,
      invitationId: parsed.data.invitationId,
      linkId: randomUUID(),
      partyId,
      recipientName: parsed.data.recipientName,
      tokenHash: hashGuestLinkToken(token),
    });
    revalidatePath("/dashboard/guests");
    return {
      partyId,
      personalizedUrl: buildPersonalizedInvitationUrl(context.genericUrl, token),
      status: "created",
    };
  } catch (error: unknown) {
    if (error instanceof GuestPersistenceError) {
      return { message: "This guest party could not be saved. Try again.", status: "error" };
    }
    return { message: "The secure guest link could not be prepared. Try again.", status: "error" };
  }
}

export async function replaceGuestPartyLinkAction(
  input: unknown,
): Promise<ReplaceGuestPartyLinkActionResult> {
  const parsed = linkActionSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "This link replacement request is no longer valid.", status: "error" };
  }

  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) {
      return {
        message: "This published invitation is unavailable. Refresh and try again.",
        status: "error",
      };
    }
    const parties = await listGuestParties(
      context.supabase,
      context.workspaceId,
      context.invitationId,
    );
    if (!parties.some((party) => party.id === parsed.data.guestPartyId)) {
      return {
        message: "This guest party is unavailable. Refresh and try again.",
        status: "error",
      };
    }

    const token = generateGuestLinkToken();
    await replaceGuestPartyLink(
      context.supabase,
      parsed.data.guestPartyId,
      randomUUID(),
      hashGuestLinkToken(token),
    );
    revalidatePath("/dashboard/guests");
    return {
      personalizedUrl: buildPersonalizedInvitationUrl(context.genericUrl, token),
      status: "replaced",
    };
  } catch (error: unknown) {
    if (error instanceof GuestPersistenceError) {
      return {
        message: "This personalized link could not be replaced. Try again.",
        status: "error",
      };
    }
    return { message: "The secure guest link could not be prepared. Try again.", status: "error" };
  }
}

export async function revokeGuestPartyLinkAction(
  input: unknown,
): Promise<RevokeGuestPartyLinkActionResult> {
  const parsed = linkActionSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "This link revocation request is no longer valid.", status: "error" };
  }

  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) {
      return {
        message: "This published invitation is unavailable. Refresh and try again.",
        status: "error",
      };
    }
    const parties = await listGuestParties(
      context.supabase,
      context.workspaceId,
      context.invitationId,
    );
    if (!parties.some((party) => party.id === parsed.data.guestPartyId)) {
      return {
        message: "This guest party is unavailable. Refresh and try again.",
        status: "error",
      };
    }

    await revokeGuestPartyLink(context.supabase, parsed.data.guestPartyId);
    revalidatePath("/dashboard/guests");
    return { status: "revoked" };
  } catch {
    return { message: "This personalized link could not be revoked. Try again.", status: "error" };
  }
}
