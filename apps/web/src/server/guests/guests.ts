import { guestLinkTokenSchema, parseInvitationDocument } from "@invitica/invitation-schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const publicIdentifierSchema = z.string().regex(/^[0-9a-f]{32}$/);
const deliveredAliasSchema = z.strictObject({
  delivered_publication_id: uuidSchema,
  invitation_id: uuidSchema,
  public_identifier: publicIdentifierSchema,
});
const draftTitleSchema = z.strictObject({ document: z.unknown(), invitation_id: uuidSchema });
const guestPartySchema = z.strictObject({
  archived_at: z.string().datetime({ offset: true }).nullable(),
  capacity: z.number().int().min(1).max(50),
  copy_count: z.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
  first_copied_at: z.string().datetime({ offset: true }).nullable(),
  id: uuidSchema,
  internal_label: z.string().trim().min(1).max(120),
  last_copied_at: z.string().datetime({ offset: true }).nullable(),
  marked_sent_at: z.string().datetime({ offset: true }).nullable(),
  recipient_name: z.string().trim().min(1).max(120),
  revision: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
const namedGuestSchema = z.strictObject({
  guest_party_id: uuidSchema,
  id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  sort_order: z.number().int().positive(),
});
const guestLinkStateSchema = z.strictObject({
  created_at: z.string().datetime({ offset: true }),
  guest_party_id: uuidSchema,
  id: uuidSchema,
  revoked_at: z.string().datetime({ offset: true }).nullable(),
  status: z.enum(["active", "revoked"]),
});
const guestRsvpRowSchema = z.strictObject({
  attendance: z.enum(["attending", "declined"]),
  attendee_count: z.number().int().min(0).max(50),
  guest_party_id: uuidSchema,
  message: z.string().trim().min(1).max(500).nullable(),
  updated_at: z.string().datetime({ offset: true }),
});
const resolvedGuestSchema = z.strictObject({ recipient_name: z.string().trim().min(1).max(120) });
const recoverableGuestLinkSchema = z.strictObject({
  encryption_key_version: z.number().int().positive(),
  link_id: uuidSchema,
  recipient_name: z.string().trim().min(1).max(120),
  token_ciphertext: z.string().regex(/^[A-Za-z0-9_-]{79}$/),
  token_nonce: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
});

export interface GuestInvitationSummary {
  readonly genericUrl: string;
  readonly invitationId: string;
  readonly publicIdentifier: string;
  readonly title: string;
}

export interface GuestPartySummary {
  readonly archivedAt: string | null;
  readonly capacity: number;
  /** How many times the creator has copied this party's invitation message. */
  readonly copyCount: number;
  readonly createdAt: string;
  readonly firstCopiedAt: string | null;
  readonly guestMembers: readonly { readonly id: string; readonly name: string }[];
  readonly id: string;
  readonly internalLabel: string;
  readonly lastCopiedAt: string | null;
  readonly linkStatus: "active" | "revoked";
  /** The creator's own statement that they sent this invitation. Never inferred. */
  readonly markedSentAt: string | null;
  readonly recipientName: string;
  readonly revision: number;
  readonly response: {
    readonly attendance: "attending" | "declined";
    readonly attendeeCount: number;
    readonly message: string | null;
    readonly updatedAt: string;
  } | null;
}

export class GuestPersistenceError extends Error {
  constructor() {
    super("Guest information could not be saved.");
    this.name = "GuestPersistenceError";
  }
}

export interface RecoverableGuestLink {
  readonly ciphertext: string;
  readonly keyVersion: number;
  readonly linkId: string;
  readonly nonce: string;
  readonly recipientName: string;
}

function invitationOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_INVITATION_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_INVITATION_ORIGIN is required in production.");
    }
    return "http://localhost:3000";
  }

  const origin = new URL(configured);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error("NEXT_PUBLIC_INVITATION_ORIGIN must be an HTTP or HTTPS origin.");
  }
  return origin.origin;
}

function invitationLabel(title: string): string {
  const label = title
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return label || "invitation";
}

export function buildGenericInvitationUrl(title: string, publicIdentifier: string): string {
  const identifier = publicIdentifierSchema.parse(publicIdentifier);
  return `${invitationOrigin()}/i/${invitationLabel(title)}-${identifier}`;
}

export function buildPersonalizedInvitationUrl(genericUrl: string, token: string): string {
  const url = new URL(genericUrl);
  url.hash = `g=${guestLinkTokenSchema.parse(token)}`;
  return url.toString();
}

function invitationTitle(document: unknown): string {
  const parsed = parseInvitationDocument(document);
  const hero = parsed.sections.find((section) => section.type === "hero");
  return hero?.props.title ?? "Invitation";
}

export async function listDeliveredGuestInvitations(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<GuestInvitationSummary[]> {
  const parsedWorkspaceId = uuidSchema.parse(workspaceId);
  const aliases = await supabase
    .from("publication_aliases")
    .select("invitation_id, public_identifier, delivered_publication_id")
    .eq("workspace_id", parsedWorkspaceId)
    .eq("delivery_status", "delivered")
    .not("delivered_publication_id", "is", null);

  if (aliases.error) throw new GuestPersistenceError();
  const delivered = z.array(deliveredAliasSchema).parse(aliases.data ?? []);
  if (delivered.length === 0) return [];

  const drafts = await supabase
    .from("invitation_drafts")
    .select("invitation_id, document")
    .eq("workspace_id", parsedWorkspaceId)
    .in(
      "invitation_id",
      delivered.map((alias) => alias.invitation_id),
    );

  if (drafts.error) throw new GuestPersistenceError();
  const titles = new Map(
    z
      .array(draftTitleSchema)
      .parse(drafts.data ?? [])
      .map((draft) => [draft.invitation_id, invitationTitle(draft.document)]),
  );

  return delivered
    .map((alias) => {
      const title = titles.get(alias.invitation_id);
      if (!title) throw new GuestPersistenceError();
      return {
        genericUrl: buildGenericInvitationUrl(title, alias.public_identifier),
        invitationId: alias.invitation_id,
        publicIdentifier: alias.public_identifier,
        title,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

/**
 * Loads one delivered invitation instead of every delivered invitation in the
 * workspace. Guest actions each need exactly one, and the list variant parses every
 * workspace document through the strict contract just to read its hero title — work
 * that grows with the creator's library and sat directly in the Copy invitation path.
 */
export async function loadDeliveredGuestInvitation(
  supabase: SupabaseClient,
  workspaceId: string,
  invitationId: string,
): Promise<GuestInvitationSummary | null> {
  const parsedWorkspaceId = uuidSchema.parse(workspaceId);
  const parsedInvitationId = uuidSchema.parse(invitationId);
  const [alias, draft] = await Promise.all([
    supabase
      .from("publication_aliases")
      .select("invitation_id, public_identifier, delivered_publication_id")
      .eq("workspace_id", parsedWorkspaceId)
      .eq("invitation_id", parsedInvitationId)
      .eq("delivery_status", "delivered")
      .not("delivered_publication_id", "is", null)
      .maybeSingle(),
    supabase
      .from("invitation_drafts")
      .select("invitation_id, document")
      .eq("workspace_id", parsedWorkspaceId)
      .eq("invitation_id", parsedInvitationId)
      .maybeSingle(),
  ]);

  if (alias.error || draft.error) throw new GuestPersistenceError();
  if (!alias.data || !draft.data) return null;

  const delivered = deliveredAliasSchema.parse(alias.data);
  const title = invitationTitle(draftTitleSchema.parse(draft.data).document);
  return {
    genericUrl: buildGenericInvitationUrl(title, delivered.public_identifier),
    invitationId: delivered.invitation_id,
    publicIdentifier: delivered.public_identifier,
    title,
  };
}

/**
 * Guest Desk reads used to throw a bare `GuestPersistenceError`, which made a hosted
 * failure indistinguishable from any other — a missing column, a revoked column grant,
 * and an RLS denial all surfaced as the same sentence. The PostgreSQL code is the only
 * thing that separates them. Identifiers and codes only; never guest names or messages.
 */
function logGuestReadFailure(
  stage: string,
  error: { code?: string; details?: string | null; hint?: string | null; message: string },
  context: Readonly<Record<string, string>>,
): void {
  console.error("[Guest Desk] read failed", {
    ...context,
    code: error.code,
    details: error.details || undefined,
    hint: error.hint || undefined,
    message: error.message,
    stage,
  });
}

async function listGuestPartiesByArchiveState(
  supabase: SupabaseClient,
  workspaceId: string,
  invitationId: string,
  archived: boolean,
): Promise<GuestPartySummary[]> {
  const parsedWorkspaceId = uuidSchema.parse(workspaceId);
  const parsedInvitationId = uuidSchema.parse(invitationId);
  const parties = supabase
    .from("guest_parties")
    .select(
      "id, internal_label, recipient_name, capacity, created_at, archived_at, revision, copy_count, first_copied_at, last_copied_at, marked_sent_at",
    )
    .eq("workspace_id", parsedWorkspaceId)
    .eq("invitation_id", parsedInvitationId)
    .order("created_at", { ascending: true });

  const filteredParties = archived
    ? parties.not("archived_at", "is", null)
    : parties.is("archived_at", null);

  const partiesResult = await filteredParties;
  if (partiesResult.error) {
    logGuestReadFailure("guest_parties", partiesResult.error, {
      archived: String(archived),
      invitationId: parsedInvitationId,
    });
    throw new GuestPersistenceError();
  }
  const parsedParties = z.array(guestPartySchema).parse(partiesResult.data ?? []);
  if (parsedParties.length === 0) return [];
  const partyIds = parsedParties.map((party) => party.id);
  const [guests, links, responses] = await Promise.all([
    supabase
      .from("guests")
      .select("id, guest_party_id, name, sort_order")
      .eq("workspace_id", parsedWorkspaceId)
      .in("guest_party_id", partyIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("guest_party_links")
      .select("id, guest_party_id, status, created_at, revoked_at")
      .eq("workspace_id", parsedWorkspaceId)
      .in("guest_party_id", partyIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("rsvp_responses")
      .select("guest_party_id, attendance, attendee_count, message, updated_at")
      .eq("workspace_id", parsedWorkspaceId)
      .in("guest_party_id", partyIds),
  ]);

  if (guests.error || links.error || responses.error) {
    const failure = guests.error ?? links.error ?? responses.error;
    if (failure) {
      logGuestReadFailure(
        guests.error ? "guests" : links.error ? "guest_party_links" : "rsvp_responses",
        failure,
        { invitationId: parsedInvitationId },
      );
    }
    throw new GuestPersistenceError();
  }
  const namedGuests = z.array(namedGuestSchema).parse(guests.data ?? []);
  const linkStates = z.array(guestLinkStateSchema).parse(links.data ?? []);
  const responseByParty = new Map(
    z
      .array(guestRsvpRowSchema)
      .parse(responses.data ?? [])
      .map((response) => [response.guest_party_id, response] as const),
  );

  return parsedParties.map((party) => {
    const response = responseByParty.get(party.id);
    return {
      archivedAt: party.archived_at,
      capacity: party.capacity,
      copyCount: party.copy_count,
      createdAt: party.created_at,
      firstCopiedAt: party.first_copied_at,
      guestMembers: namedGuests
        .filter((guest) => guest.guest_party_id === party.id)
        .map((guest) => ({ id: guest.id, name: guest.name })),
      id: party.id,
      internalLabel: party.internal_label,
      lastCopiedAt: party.last_copied_at,
      linkStatus: linkStates.some(
        (link) => link.guest_party_id === party.id && link.status === "active",
      )
        ? "active"
        : "revoked",
      markedSentAt: party.marked_sent_at,
      recipientName: party.recipient_name,
      revision: party.revision,
      response: response
        ? {
            attendance: response.attendance,
            attendeeCount: response.attendee_count,
            message: response.message,
            updatedAt: response.updated_at,
          }
        : null,
    };
  });
}

export async function listGuestParties(
  supabase: SupabaseClient,
  workspaceId: string,
  invitationId: string,
): Promise<GuestPartySummary[]> {
  return listGuestPartiesByArchiveState(supabase, workspaceId, invitationId, false);
}

export async function listTrashedGuestParties(
  supabase: SupabaseClient,
  workspaceId: string,
  invitationId: string,
): Promise<GuestPartySummary[]> {
  return listGuestPartiesByArchiveState(supabase, workspaceId, invitationId, true);
}

export async function createGuestPartiesBulk(
  supabase: SupabaseClient,
  input: {
    invitationId: string;
    mutationId: string;
    parties: Array<{
      capacity: number;
      encryptionKeyVersion: number;
      guestNames: string[];
      internalLabel: string;
      linkId: string;
      partyId: string;
      recipientName: string;
      tokenCiphertext: string;
      tokenHash: string;
      tokenNonce: string;
    }>;
    requestHash: string;
  },
): Promise<void> {
  const { error } = await supabase.rpc("create_guest_parties_bulk", {
    p_invitation_id: uuidSchema.parse(input.invitationId),
    p_mutation_id: uuidSchema.parse(input.mutationId),
    p_parties: input.parties,
    p_request_hash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .parse(input.requestHash),
  });
  if (error) {
    console.error("[Guest Desk] create_guest_parties_bulk failed", {
      code: error.code,
      hint: error.hint || undefined,
      message: error.message,
    });
    throw new GuestPersistenceError();
  }
}

export async function replaceGuestPartyLink(
  supabase: SupabaseClient,
  guestPartyId: string,
  linkId: string,
  tokenHash: string,
  encrypted: { ciphertext: string; keyVersion: number; nonce: string },
): Promise<void> {
  const { error } = await supabase.rpc("replace_guest_party_link_recoverable", {
    p_encryption_key_version: encrypted.keyVersion,
    p_guest_party_id: uuidSchema.parse(guestPartyId),
    p_link_id: uuidSchema.parse(linkId),
    p_token_ciphertext: encrypted.ciphertext,
    p_token_hash: tokenHash,
    p_token_nonce: encrypted.nonce,
  });
  if (error) throw new GuestPersistenceError();
}

export async function getRecoverableGuestLink(
  supabase: SupabaseClient,
  guestPartyId: string,
): Promise<RecoverableGuestLink | null> {
  const { data, error } = await supabase.rpc("get_guest_party_link_secret", {
    p_guest_party_id: uuidSchema.parse(guestPartyId),
  });
  if (error) throw new GuestPersistenceError();
  const rows = z.array(recoverableGuestLinkSchema).parse(data ?? []);
  const row = rows[0];
  return row
    ? {
        ciphertext: row.token_ciphertext,
        keyVersion: row.encryption_key_version,
        linkId: row.link_id,
        nonce: row.token_nonce,
        recipientName: row.recipient_name,
      }
    : null;
}

export async function trashGuestParty(
  supabase: SupabaseClient,
  guestPartyId: string,
  expectedRevision: number,
): Promise<void> {
  const { error } = await supabase.rpc("trash_guest_party", {
    p_expected_revision: expectedRevision,
    p_guest_party_id: uuidSchema.parse(guestPartyId),
  });
  if (error) throw new GuestPersistenceError();
}

export async function updateGuestParty(
  supabase: SupabaseClient,
  input: {
    capacity: number;
    expectedRevision: number;
    guestNames: string[];
    guestPartyId: string;
    internalLabel: string;
    recipientName: string;
  },
): Promise<void> {
  const { error } = await supabase.rpc("update_guest_party", {
    p_capacity: input.capacity,
    p_expected_revision: input.expectedRevision,
    p_guest_names: input.guestNames,
    p_guest_party_id: uuidSchema.parse(input.guestPartyId),
    p_internal_label: input.internalLabel,
    p_recipient_name: input.recipientName,
  });
  if (error) throw new GuestPersistenceError();
}

export async function restoreGuestParty(
  supabase: SupabaseClient,
  guestPartyId: string,
  expectedRevision: number,
): Promise<void> {
  const { error } = await supabase.rpc("restore_guest_party", {
    p_expected_revision: expectedRevision,
    p_guest_party_id: uuidSchema.parse(guestPartyId),
  });
  if (error) throw new GuestPersistenceError();
}

export async function revokeGuestPartyLink(
  supabase: SupabaseClient,
  guestPartyId: string,
): Promise<void> {
  const { error } = await supabase.rpc("revoke_guest_party_link", {
    p_guest_party_id: uuidSchema.parse(guestPartyId),
  });
  if (error) throw new GuestPersistenceError();
}

/**
 * Records that the creator copied a party's invitation message. Never bumps the party
 * revision — a copy is not an edit, and bumping it would make an open editor report a
 * conflict the creator did not cause.
 */
export async function recordGuestInvitationCopy(
  supabase: SupabaseClient,
  guestPartyId: string,
): Promise<void> {
  const { error } = await supabase.rpc("record_guest_invitation_copy", {
    p_guest_party_id: uuidSchema.parse(guestPartyId),
  });
  if (error) throw new GuestPersistenceError();
}

/** Sets or clears the creator's "I have sent this" mark. Reversible and idempotent. */
export async function setGuestInvitationSent(
  supabase: SupabaseClient,
  guestPartyId: string,
  sent: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("set_guest_invitation_sent", {
    p_guest_party_id: uuidSchema.parse(guestPartyId),
    p_sent: sent,
  });
  if (error) throw new GuestPersistenceError();
}

export async function resolveGuestRecipient(
  supabase: SupabaseClient,
  publicIdentifier: string,
  tokenHash: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("resolve_guest_party_link", {
    p_public_identifier: publicIdentifierSchema.parse(publicIdentifier),
    p_token_hash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .parse(tokenHash),
  });
  if (error) throw new GuestPersistenceError();
  const records = z.array(resolvedGuestSchema).parse(data ?? []);
  return records[0]?.recipient_name ?? null;
}
