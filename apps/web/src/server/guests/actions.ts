"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ensurePersonalWorkspace, requireConfirmedUser } from "../auth/session";
import {
  buildPersonalizedInvitationUrl,
  createGuestPartiesBulk,
  type GuestInvitationSummary,
  type GuestPartyPage,
  type GuestPartyResponseFilter,
  GuestPersistenceError,
  getRecoverableGuestLink,
  listGuestParties,
  listGuestPartyPage,
  listTrashedGuestParties,
  loadDeliveredGuestInvitation,
  recordGuestInvitationCopy,
  replaceGuestPartyLink,
  restoreGuestParty,
  revokeGuestPartyLink,
  setGuestInvitationSent,
  trashGuestParty,
  updateGuestParty,
  updateInvitationShareMessages,
} from "./guests";
import {
  buildPersonalInvitationMessage,
  GENERAL_MESSAGE_TOKENS,
  PERSONAL_MESSAGE_TOKENS,
} from "./sharing";
import {
  decryptGuestLinkToken,
  encryptGuestLinkToken,
  generateGuestLinkToken,
  hashGuestLinkToken,
} from "./tokens";

const uuidSchema = z.string().uuid();
const guestNamesSchema = z.array(z.string().trim().min(1).max(120)).max(50);
const guestPartyInputSchema = z
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
const guestPartyPageSchema = z.strictObject({
  invitationId: uuidSchema,
  offset: z.number().int().nonnegative().max(1000000),
  query: z.string().trim().max(120),
  responseFilter: z.enum([
    "all",
    "already-sent",
    "attending",
    "awaiting",
    "declined",
    "not-yet-sent",
  ]),
});

export type CreateGuestPartiesActionResult =
  | { count: number; status: "created" }
  | { message: string; status: "error" };

export type CopyGuestInvitationActionResult =
  | { copyText: string; personalizedUrl: string; status: "ready" }
  | { message: string; status: "error" };

export interface PreparedGuestInvitationCopy {
  readonly copyText: string;
  readonly guestPartyId: string;
  readonly personalizedUrl: string;
}

export type PrepareGuestInvitationCopiesActionResult =
  | { copies: readonly PreparedGuestInvitationCopy[]; status: "ready" }
  | { message: string; status: "error" };

export type ReplaceGuestPartyLinkActionResult =
  | { copyText: string; personalizedUrl: string; status: "replaced" }
  | { message: string; status: "error" };

export type GuestManagementActionResult =
  | { status: "restored" | "revoked" | "trashed" | "updated" }
  | { message: string; status: "error" };

export type LoadGuestPartyPageActionResult =
  | { page: GuestPartyPage; status: "ready" }
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

export async function loadGuestPartyPageAction(
  input: unknown,
): Promise<LoadGuestPartyPageActionResult> {
  const parsed = guestPartyPageSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "This guest-page request is no longer valid.", status: "error" };
  }

  try {
    const context = await loadOwnedInvitationContext(parsed.data.invitationId);
    if (!context) {
      return {
        message: "This published invitation is unavailable. Refresh and try again.",
        status: "error",
      };
    }
    const page = await listGuestPartyPage(
      context.supabase,
      context.workspaceId,
      context.invitationId,
      {
        offset: parsed.data.offset,
        query: parsed.data.query,
        responseFilter: parsed.data.responseFilter as GuestPartyResponseFilter,
      },
    );
    return { page, status: "ready" };
  } catch {
    return {
      message: "Invitica could not load more guest parties. Check your connection and try again.",
      status: "error",
    };
  }
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

    const normalizedParties = parsed.data.parties.map((party) => ({
      ...party,
      guestNames:
        party.guestNames.length === 0 && party.capacity === 1
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

const recordCopySchema = z.strictObject({ guestPartyId: uuidSchema });
const setSentSchema = z.strictObject({ guestPartyId: uuidSchema, sent: z.boolean() });

/**
 * Records that a party's invitation was copied.
 *
 * Called *after* the clipboard already has the message, never before: the copy must feel
 * instant, and tracking is bookkeeping rather than part of the action. A failure here is
 * reported as a no-op — losing one count is strictly better than telling a creator their
 * copy failed when it did not.
 */
export async function recordGuestInvitationCopyAction(
  input: unknown,
): Promise<{ status: "ignored" | "recorded" }> {
  const parsed = recordCopySchema.safeParse(input);
  if (!parsed.success) return { status: "ignored" };

  try {
    const { supabase } = await requireConfirmedUser();
    await recordGuestInvitationCopy(supabase, parsed.data.guestPartyId);
    revalidatePath("/dashboard/guests");
    return { status: "recorded" };
  } catch {
    return { status: "ignored" };
  }
}

/** Sets or clears the creator's own "already sent" mark. Reversible by design. */
export async function setGuestInvitationSentAction(
  input: unknown,
): Promise<GuestManagementActionResult> {
  const parsed = setSentSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "This request is no longer valid. Refresh and try again.", status: "error" };
  }

  try {
    const { supabase } = await requireConfirmedUser();
    await setGuestInvitationSent(supabase, parsed.data.guestPartyId, parsed.data.sent);
    revalidatePath("/dashboard/guests");
    return { status: "updated" };
  } catch {
    return {
      message: "That could not be saved. Refresh and try again.",
      status: "error",
    };
  }
}

/**
 * A creator-authored message. Blank clears the customisation and restores the generated default,
 * which is why an empty string is accepted rather than rejected.
 */
function shareMessageSchema(allowed: readonly string[]) {
  return z
    .string()
    .max(2000)
    .transform((value) => value.trim())
    .refine(
      (value) => value === "" || value.includes("{link}"),
      "Keep {link} so guests can open the invitation.",
    )
    .refine((value) => {
      for (const [, token] of value.matchAll(/\{([a-zA-Z]+)\}/g)) {
        // An unrecognised placeholder would be pasted to a guest as literal "{name}" text.
        if (!allowed.includes(token as string)) return false;
      }
      return true;
    }, "Use only the placeholders listed below.")
    .transform((value) => (value === "" ? null : value));
}

const shareMessagesSchema = z.strictObject({
  general: shareMessageSchema(GENERAL_MESSAGE_TOKENS),
  invitationId: uuidSchema,
  personal: shareMessageSchema(PERSONAL_MESSAGE_TOKENS),
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

const prepareCopiesSchema = z.strictObject({
  guestPartyIds: z.array(uuidSchema).min(1).max(50),
  invitationId: uuidSchema,
});

/** Bounded so recovering fifty links is one short burst rather than fifty in parallel. */
const COPY_RESOLUTION_CONCURRENCY = 8;

/**
 * Recovers the ready-to-send message for several guest parties in one request.
 *
 * Copy invitation used to resolve a single token *after* the creator clicked, which
 * cost several sequential round trips to Singapore and — because
 * `navigator.clipboard.writeText` needs an unspent user gesture — made WebKit reject
 * the write outright and fall through to the manual-copy box. Resolving ahead of the
 * click lets the copy itself be synchronous.
 *
 * Ownership is still enforced per party: `get_guest_party_link_secret` is security
 * definer and derives the owner from `auth.uid()`, so an id the creator does not own
 * simply resolves to nothing. A revoked or replaced link resolves to nothing too, so
 * it is absent from the result rather than returned as a stale message.
 */
export async function prepareGuestInvitationCopiesAction(
  input: unknown,
): Promise<PrepareGuestInvitationCopiesActionResult> {
  const parsed = prepareCopiesSchema.safeParse(input);
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

    const copies: PreparedGuestInvitationCopy[] = [];
    const pending = [...parsed.data.guestPartyIds];

    while (pending.length > 0) {
      const batch = pending.splice(0, COPY_RESOLUTION_CONCURRENCY);
      const resolved = await Promise.all(
        batch.map(async (guestPartyId) => {
          const secret = await getRecoverableGuestLink(context.supabase, guestPartyId);
          if (!secret) return null;
          const personalizedUrl = buildPersonalizedInvitationUrl(
            context.genericUrl,
            decryptGuestLinkToken(
              { ciphertext: secret.ciphertext, keyVersion: secret.keyVersion, nonce: secret.nonce },
              secret.linkId,
            ),
          );
          return {
            copyText: buildPersonalInvitationMessage(
              context,
              secret.recipientName,
              personalizedUrl,
            ),
            guestPartyId,
            personalizedUrl,
          };
        }),
      );
      for (const copy of resolved) if (copy) copies.push(copy);
    }

    return { copies, status: "ready" };
  } catch {
    return {
      message: "These private invitations could not be prepared. Try again.",
      status: "error",
    };
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
