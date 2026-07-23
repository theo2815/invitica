import { type InvitationDocument, parseInvitationDocument } from "@invitica/invitation-schema";
import {
  resolveTemplateVersion,
  type TemplateManifest,
  UnknownTemplateError,
} from "@invitica/template-kit";
import { z } from "zod";

import type { createClient } from "../../lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const invitationIdSchema = z.string().uuid();

const createDraftInputSchema = z.strictObject({
  invitationId: invitationIdSchema,
  templateVersionId: z.string().uuid(),
});

const optionalHttpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  });

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  });

export const saveGardenPromiseInputSchema = z.strictObject({
  dateLabel: z.string().trim().max(120),
  expectedRevision: z.number().int().positive(),
  invitationId: invitationIdSchema,
  mapUrl: optionalHttpUrlSchema,
  rsvpDeadline: z.union([z.literal(""), dateOnlySchema]),
  rsvpMessage: z.string().trim().max(500),
  subtitle: z.string().trim().max(240),
  title: z.string().trim().min(1).max(120),
  venueAddress: z.string().trim().min(1).max(500),
  venueName: z.string().trim().min(1).max(120),
});

const storedDraftSchema = z.strictObject({
  invitation_id: invitationIdSchema,
  template_version_id: z.string().uuid(),
  revision: z.number().int().positive(),
  document: z.unknown(),
});

const storedDraftListSchema = z.array(
  storedDraftSchema.extend({
    updated_at: z.string().datetime({ offset: true }),
  }),
);

const occasionByListing: Record<TemplateManifest["listing"]["occasion"], string> = {
  Anniversary: "anniversary",
  "Baby shower": "baby_shower",
  Birthday: "birthday",
  Christening: "christening",
  Debut: "debut",
  Wedding: "wedding",
};

export class TemplateUnavailableError extends Error {
  constructor() {
    super("This template is not available for invitation creation.");
    this.name = "TemplateUnavailableError";
  }
}

export class InvitationDraftPersistenceError extends Error {
  constructor() {
    super("The invitation draft could not be saved.");
    this.name = "InvitationDraftPersistenceError";
  }
}

export class InvitationDraftConflictError extends Error {
  constructor() {
    super("This invitation draft changed in another session.");
    this.name = "InvitationDraftConflictError";
  }
}

export class InvitationDeletionUnavailableError extends Error {
  constructor() {
    super("Only invitations that have never been submitted for publishing can be deleted here.");
    this.name = "InvitationDeletionUnavailableError";
  }
}

export async function deleteUnpublishedInvitation(
  supabase: SupabaseServerClient,
  invitationId: string,
) {
  const parsedInvitationId = invitationIdSchema.parse(invitationId);
  const { error } = await supabase.rpc("delete_unpublished_invitation", {
    p_invitation_id: parsedInvitationId,
  });

  if (error?.code === "55000") throw new InvitationDeletionUnavailableError();
  if (error) throw new InvitationDraftPersistenceError();
}

export async function createInitialInvitationDraft(supabase: SupabaseServerClient, input: unknown) {
  const { invitationId, templateVersionId } = createDraftInputSchema.parse(input);
  const manifest = resolveTemplateVersion(templateVersionId);

  if (manifest.qualityStatus !== "production") {
    throw new TemplateUnavailableError();
  }

  const document = parseInvitationDocument(structuredClone(manifest.defaultDocument));
  const { data, error } = await supabase.rpc("create_invitation_draft", {
    p_document: document,
    p_event_name: `${manifest.listing.name} invitation`,
    p_event_timezone: document.eventTimezone,
    p_invitation_id: invitationId,
    p_locale: document.locale,
    p_occasion: occasionByListing[manifest.listing.occasion],
    p_template_version_id: manifest.templateVersionId,
  });

  if (error) {
    throw new InvitationDraftPersistenceError();
  }

  return invitationIdSchema.parse(data);
}

export async function loadInvitationDraft(supabase: SupabaseServerClient, invitationId: string) {
  const parsedInvitationId = invitationIdSchema.parse(invitationId);
  const { data, error } = await supabase
    .from("invitation_drafts")
    .select("invitation_id, template_version_id, revision, document")
    .eq("invitation_id", parsedInvitationId)
    .maybeSingle();

  if (error) {
    throw new InvitationDraftPersistenceError();
  }

  if (!data) {
    return null;
  }

  const record = storedDraftSchema.parse(data);
  const document = parseInvitationDocument(record.document);
  const manifest = resolveTemplateVersion(record.template_version_id);

  if (document.templateVersionId !== manifest.templateVersionId) {
    throw new UnknownTemplateError(document.templateVersionId);
  }

  return {
    document,
    invitationId: record.invitation_id,
    manifest,
    revision: record.revision,
  };
}

export async function listInvitationDrafts(supabase: SupabaseServerClient, workspaceId: string) {
  const parsedWorkspaceId = invitationIdSchema.parse(workspaceId);
  const { data, error } = await supabase
    .from("invitation_drafts")
    .select("invitation_id, template_version_id, revision, document, updated_at")
    .eq("workspace_id", parsedWorkspaceId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new InvitationDraftPersistenceError();
  }

  return storedDraftListSchema.parse(data ?? []).map((record) => {
    const document = parseInvitationDocument(record.document);
    const manifest = resolveTemplateVersion(record.template_version_id);

    if (document.templateVersionId !== manifest.templateVersionId) {
      throw new UnknownTemplateError(document.templateVersionId);
    }

    const hero = document.sections.find((section) => section.type === "hero");

    return {
      dateLabel: hero?.props.dateLabel ?? null,
      invitationId: record.invitation_id,
      manifest,
      revision: record.revision,
      templateVersionId: record.template_version_id,
      title: hero?.props.title ?? manifest.listing.name,
      updatedAt: record.updated_at,
    };
  });
}

function applyGardenPromiseFields(
  document: InvitationDocument,
  fields: Omit<z.infer<typeof saveGardenPromiseInputSchema>, "expectedRevision" | "invitationId">,
) {
  let heroUpdated = false;
  let venueUpdated = false;
  let rsvpUpdated = false;
  const sections = document.sections.map((section) => {
    if (!heroUpdated && section.type === "hero") {
      heroUpdated = true;
      const props = { ...section.props, title: fields.title };
      if (fields.subtitle) props.subtitle = fields.subtitle;
      else delete props.subtitle;
      if (fields.dateLabel) props.dateLabel = fields.dateLabel;
      else delete props.dateLabel;
      return { ...section, props };
    }

    if (!venueUpdated && section.type === "venue") {
      venueUpdated = true;
      const props = {
        ...section.props,
        address: fields.venueAddress,
        venueName: fields.venueName,
      };
      if (fields.mapUrl) props.mapUrl = fields.mapUrl;
      else delete props.mapUrl;
      return { ...section, props };
    }

    if (!rsvpUpdated && section.type === "rsvp") {
      rsvpUpdated = true;
      const props = { ...section.props };
      if (fields.rsvpMessage) props.message = fields.rsvpMessage;
      else delete props.message;
      if (fields.rsvpDeadline) {
        props.deadline = `${fields.rsvpDeadline}T23:59:59+08:00`;
      } else {
        delete props.deadline;
      }
      return { ...section, props };
    }

    return section;
  });

  if (!heroUpdated || !venueUpdated || !rsvpUpdated) {
    throw new InvitationDraftPersistenceError();
  }

  return parseInvitationDocument({ ...document, sections });
}

export async function saveGardenPromiseDraft(supabase: SupabaseServerClient, input: unknown) {
  const parsed = saveGardenPromiseInputSchema.parse(input);
  const draft = await loadInvitationDraft(supabase, parsed.invitationId);

  if (!draft) {
    throw new InvitationDraftPersistenceError();
  }

  if (draft.revision !== parsed.expectedRevision) {
    throw new InvitationDraftConflictError();
  }

  applyGardenPromiseFields(draft.document, parsed);

  const { data, error } = await supabase.rpc("update_garden_promise_details", {
    p_date_label: parsed.dateLabel || null,
    p_expected_revision: parsed.expectedRevision,
    p_invitation_id: parsed.invitationId,
    p_map_url: parsed.mapUrl || null,
    p_rsvp_deadline: parsed.rsvpDeadline || null,
    p_rsvp_message: parsed.rsvpMessage || null,
    p_subtitle: parsed.subtitle || null,
    p_title: parsed.title,
    p_venue_address: parsed.venueAddress,
    p_venue_name: parsed.venueName,
  });

  if (error?.code === "40001") {
    throw new InvitationDraftConflictError();
  }

  if (error) {
    throw new InvitationDraftPersistenceError();
  }

  return z.coerce.number().int().positive().parse(data);
}
