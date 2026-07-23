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
  capacity: z.number().int().min(1).max(50),
  created_at: z.string().datetime({ offset: true }),
  id: uuidSchema,
  internal_label: z.string().trim().min(1).max(120),
  recipient_name: z.string().trim().min(1).max(120),
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

export interface GuestInvitationSummary {
  readonly genericUrl: string;
  readonly invitationId: string;
  readonly publicIdentifier: string;
  readonly title: string;
}

export interface GuestPartySummary {
  readonly capacity: number;
  readonly createdAt: string;
  readonly guestNames: readonly string[];
  readonly id: string;
  readonly internalLabel: string;
  readonly linkStatus: "active" | "revoked";
  readonly recipientName: string;
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

export async function listGuestParties(
  supabase: SupabaseClient,
  workspaceId: string,
  invitationId: string,
): Promise<GuestPartySummary[]> {
  const parsedWorkspaceId = uuidSchema.parse(workspaceId);
  const parsedInvitationId = uuidSchema.parse(invitationId);
  const parties = await supabase
    .from("guest_parties")
    .select("id, internal_label, recipient_name, capacity, created_at")
    .eq("workspace_id", parsedWorkspaceId)
    .eq("invitation_id", parsedInvitationId)
    .order("created_at", { ascending: true });

  if (parties.error) throw new GuestPersistenceError();
  const parsedParties = z.array(guestPartySchema).parse(parties.data ?? []);
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

  if (guests.error || links.error || responses.error) throw new GuestPersistenceError();
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
      capacity: party.capacity,
      createdAt: party.created_at,
      guestNames: namedGuests
        .filter((guest) => guest.guest_party_id === party.id)
        .map((guest) => guest.name),
      id: party.id,
      internalLabel: party.internal_label,
      linkStatus: linkStates.some(
        (link) => link.guest_party_id === party.id && link.status === "active",
      )
        ? "active"
        : "revoked",
      recipientName: party.recipient_name,
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

export async function createGuestParty(
  supabase: SupabaseClient,
  input: {
    capacity: number;
    guestNames: string[];
    internalLabel: string;
    invitationId: string;
    linkId: string;
    partyId: string;
    recipientName: string;
    tokenHash: string;
  },
): Promise<void> {
  const { error } = await supabase.rpc("create_guest_party", {
    p_capacity: input.capacity,
    p_guest_names: input.guestNames,
    p_internal_label: input.internalLabel,
    p_invitation_id: input.invitationId,
    p_link_id: input.linkId,
    p_party_id: input.partyId,
    p_recipient_name: input.recipientName,
    p_token_hash: input.tokenHash,
  });
  if (error) throw new GuestPersistenceError();
}

export async function replaceGuestPartyLink(
  supabase: SupabaseClient,
  guestPartyId: string,
  linkId: string,
  tokenHash: string,
): Promise<void> {
  const { error } = await supabase.rpc("replace_guest_party_link", {
    p_guest_party_id: uuidSchema.parse(guestPartyId),
    p_link_id: uuidSchema.parse(linkId),
    p_token_hash: tokenHash,
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
