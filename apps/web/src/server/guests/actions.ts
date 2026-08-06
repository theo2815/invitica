"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ensurePersonalWorkspace, requireConfirmedUser } from "../auth/session";
import {
  buildPersonalizedInvitationUrl,
  createGuestPartiesBulk,
  type GuestInvitationSummary,
  GuestPersistenceError,
  getRecoverableGuestLink,
  listGuestParties,
  listTrashedGuestParties,
  loadDeliveredGuestInvitation,
  replaceGuestPartyLink,
  restoreGuestParty,
  revokeGuestPartyLink,
  setGuestInvitationSent,
  trashGuestParty,
  updateGuestParty,
  updateInvitationShareMessages,
} from "./guests";
import { guestNamesSchema, guestPartyInputSchema } from "./party-input";
import { generalShareMessageSchema, personalShareMessageSchema } from "./share-message-input";
import { buildPersonalInvitationMessage } from "./sharing";
import {
  decryptGuestLinkToken,
  encryptGuestLinkToken,
  generateGuestLinkToken,
  hashGuestLinkToken,
} from "./tokens";

const uuidSchema = z.string().uuid();
const createGuestPartiesSchema = z.strictObject({
  invitationId: uuidSchema,
  mutationId: uuidSchema,
  parties: z.array(guestPartyInputSchema).min(1).max(50),
});
const partyActionSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  guestPartyId: uuidSchema,
  invitationId: uuidSchema,
});
const updateGuestPartySchema = partyActionSchema
  .extend({
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
const linkActionSchema = z.strictObject({ guestPartyId: uuidSchema, invitationId: uuidSchema });

export type CreateGuestPartiesActionResult =
  | { count: number; status: "created" }
  | { message: string; status: "error" };

export type CopyGuestInvitationActionResult =
  | { copyText: string; personalizedUrl: string; status: "ready" }
  | { message: string; status: "error" };

export type ReplaceGuestPartyLinkActionResult =
  | { copyText: string; personalizedUrl: string; status: "replaced" }
  | { message: string; status: "error" };

export type GuestManagementActionResult =
  | { status: "restored" | "revoked" | "trashed" | "updated" }
  | { message: string; status: "error" };

export type SetGuestInvitationSentActionResult =
  | { markedSentAt: string | null; status: "updated" }
  | { message: string; status: "error" };

async function loadOwnedInvitationContext(invitationId: string): Promise<
  | (GuestInvitationSummary & {
      supabase: Awaited<ReturnType<typeof ensurePersonalWorkspace>>["supabase"];
      workspaceId: string;
    })
  | null
> {
  const { error, supabase, workspaceId } = await ensurePersonalWorkspace();
  if (error || !workspaceId) return null;
  const invitation = await loadDeliveredGuestInvitation(supabase, workspaceId, invitationId);
  return invitation ? { ...invitation, supabase, workspaceId } : null;
}

function requestHash(parties: z.infer<typeof guestPartyInputSchema>[]): string {
  return createHash("sha256").update(JSON.stringify(parties), "utf8").digest("hex");
}

export async function createGuestPartiesAction(
  input: unknown,
): Promise<CreateGuestPartiesActionResult> {
  const parsed = createGuestPartiesSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "Check the highlighted guest rows and try again.", status: "error" };
  }

  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) {
      return {
        message: "This published invitation is unavailable. Refresh and try again.",
        status: "error",
      };
    }

    if (
      context.occasion === "Romance" &&
      parsed.data.parties.some((party) => party.capacity !== 1)
    ) {
      return {
        message: "Each Romance invitation must belong to exactly one recipient.",
        status: "error",
      };
    }

    const normalizedParties = parsed.data.parties.map((party) => ({
      ...party,
      guestNames:
        context.occasion === "Romance" && party.guestNames.length === 0
          ? [party.internalLabel]
          : party.guestNames,
    }));
    const securedParties = normalizedParties.map((party) => {
      const linkId = randomUUID();
      const token = generateGuestLinkToken();
      const encrypted = encryptGuestLinkToken(token, linkId);
      return {
        ...party,
        encryptionKeyVersion: encrypted.keyVersion,
        linkId,
        partyId: randomUUID(),
        tokenCiphertext: encrypted.ciphertext,
        tokenHash: hashGuestLinkToken(token),
        tokenNonce: encrypted.nonce,
      };
    });

    await createGuestPartiesBulk(context.supabase, {
      invitationId: context.invitationId,
      mutationId: parsed.data.mutationId,
      parties: securedParties,
      requestHash: requestHash(normalizedParties),
    });
    revalidatePath("/dashboard/guests");
    return { count: normalizedParties.length, status: "created" };
  } catch (error: unknown) {
    if (error instanceof GuestPersistenceError) {
      return { message: "These guests could not be saved. Try again.", status: "error" };
    }
    return { message: "Secure guest links could not be prepared. Try again.", status: "error" };
  }
}

export async function copyGuestInvitationAction(
  input: unknown,
): Promise<CopyGuestInvitationActionResult> {
  const parsed = linkActionSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "This invitation copy request is no longer valid.", status: "error" };
  }

  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) {
      return {
        message: "This published invitation is unavailable. Refresh and try again.",
        status: "error",
      };
    }
    const secret = await getRecoverableGuestLink(context.supabase, parsed.data.guestPartyId);
    if (!secret) {
      return {
        message: "This older or revoked link cannot be copied. Create a fresh link first.",
        status: "error",
      };
    }
    const token = decryptGuestLinkToken(
      { ciphertext: secret.ciphertext, keyVersion: secret.keyVersion, nonce: secret.nonce },
      secret.linkId,
    );
    const personalizedUrl = buildPersonalizedInvitationUrl(context.genericUrl, token);
    return {
      copyText: buildPersonalInvitationMessage(context, secret.recipientName, personalizedUrl),
      personalizedUrl,
      status: "ready",
    };
  } catch {
    return {
      message: "This private invitation could not be prepared. Try again.",
      status: "error",
    };
  }
}

const setSentSchema = z.strictObject({ guestPartyId: uuidSchema, sent: z.boolean() });

/** Sets or clears the creator's own "already sent" mark. Reversible by design. */
export async function setGuestInvitationSentAction(
  input: unknown,
): Promise<SetGuestInvitationSentActionResult> {
  const parsed = setSentSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "This request is no longer valid. Refresh and try again.", status: "error" };
  }

  try {
    const { supabase } = await requireConfirmedUser();
    const markedSentAt = await setGuestInvitationSent(
      supabase,
      parsed.data.guestPartyId,
      parsed.data.sent,
    );
    return { markedSentAt, status: "updated" };
  } catch {
    return {
      message: "That could not be saved. Refresh and try again.",
      status: "error",
    };
  }
}

const shareMessagesSchema = z.strictObject({
  general: generalShareMessageSchema,
  invitationId: uuidSchema,
  personal: personalShareMessageSchema,
});

/** Saves the creator's own share wording, or clears it back to the generated default. */
export async function saveInvitationShareMessagesAction(
  input: unknown,
): Promise<GuestManagementActionResult> {
  const parsed = shareMessagesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      message:
        parsed.error.issues[0]?.message ?? "That message could not be saved. Check it and retry.",
      status: "error",
    };
  }

  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) {
      return {
        message: "This published invitation is unavailable. Refresh and try again.",
        status: "error",
      };
    }
    await updateInvitationShareMessages(context.supabase, parsed.data.invitationId, {
      general: parsed.data.general,
      personal: parsed.data.personal,
    });
    revalidatePath("/dashboard/guests");
    return { status: "updated" };
  } catch {
    return { message: "That message could not be saved. Try again.", status: "error" };
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
    const party = parties.find((candidate) => candidate.id === parsed.data.guestPartyId);
    if (!party) {
      return {
        message: "This guest party is unavailable. Refresh and try again.",
        status: "error",
      };
    }

    const token = generateGuestLinkToken();
    const linkId = randomUUID();
    const encrypted = encryptGuestLinkToken(token, linkId);
    await replaceGuestPartyLink(
      context.supabase,
      party.id,
      linkId,
      hashGuestLinkToken(token),
      encrypted,
    );
    revalidatePath("/dashboard/guests");
    const personalizedUrl = buildPersonalizedInvitationUrl(context.genericUrl, token);
    return {
      copyText: buildPersonalInvitationMessage(context, party.recipientName, personalizedUrl),
      personalizedUrl,
      status: "replaced",
    };
  } catch (error: unknown) {
    if (error instanceof GuestPersistenceError) {
      return { message: "This private link could not be replaced. Try again.", status: "error" };
    }
    return { message: "A secure replacement link could not be prepared.", status: "error" };
  }
}

export async function revokeGuestPartyLinkAction(
  input: unknown,
): Promise<GuestManagementActionResult> {
  const parsed = linkActionSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "This link revocation request is no longer valid.", status: "error" };
  }

  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) {
      return { message: "This published invitation is unavailable.", status: "error" };
    }
    await revokeGuestPartyLink(context.supabase, parsed.data.guestPartyId);
    revalidatePath("/dashboard/guests");
    return { status: "revoked" };
  } catch {
    return { message: "This private link could not be revoked. Try again.", status: "error" };
  }
}

export async function updateGuestPartyAction(input: unknown): Promise<GuestManagementActionResult> {
  const parsed = updateGuestPartySchema.safeParse(input);
  if (!parsed.success) {
    return { message: "Check the party details and try again.", status: "error" };
  }
  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) return { message: "This invitation is unavailable.", status: "error" };
    if (context.occasion === "Romance" && parsed.data.capacity !== 1) {
      return {
        message: "A Romance invitation must belong to exactly one recipient.",
        status: "error",
      };
    }
    await updateGuestParty(context.supabase, parsed.data);
    revalidatePath("/dashboard/guests");
    return { status: "updated" };
  } catch {
    return {
      message: "This party could not be updated. Refresh and try again.",
      status: "error",
    };
  }
}

export async function trashGuestPartyAction(input: unknown): Promise<GuestManagementActionResult> {
  const parsed = partyActionSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "This party removal request is no longer valid.", status: "error" };
  }
  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) return { message: "This invitation is unavailable.", status: "error" };
    await trashGuestParty(context.supabase, parsed.data.guestPartyId, parsed.data.expectedRevision);
    revalidatePath("/dashboard/guests");
    return { status: "trashed" };
  } catch {
    return {
      message: "This party could not be moved to trash. Refresh and try again.",
      status: "error",
    };
  }
}

export async function restoreGuestPartyAction(
  input: unknown,
): Promise<GuestManagementActionResult> {
  const parsed = partyActionSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "This restore request is no longer valid.", status: "error" };
  }
  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) return { message: "This invitation is unavailable.", status: "error" };
    const trashedParties = await listTrashedGuestParties(
      context.supabase,
      context.workspaceId,
      context.invitationId,
    );
    if (!trashedParties.some((party) => party.id === parsed.data.guestPartyId)) {
      return { message: "This trashed party is unavailable.", status: "error" };
    }
    await restoreGuestParty(
      context.supabase,
      parsed.data.guestPartyId,
      parsed.data.expectedRevision,
    );
    revalidatePath("/dashboard/guests");
    return { status: "restored" };
  } catch {
    return { message: "This party could not be restored. Refresh and try again.", status: "error" };
  }
}
