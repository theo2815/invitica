import {
  CURRENT_PUBLICATION_SNAPSHOT_VERSION,
  parsePublicationSnapshot,
  type PublicationAssetManifestEntry,
} from "@invitica/invitation-schema";
import { resolveTemplateRendererRegistration } from "@invitica/renderer";
import { z } from "zod";

import type { createClient } from "../../lib/supabase/server";
import {
  type MediaObjectStore,
  R2MediaObjectStore,
  readR2MediaConfig,
} from "../media/object-store";
import {
  PublicationMediaUnavailableError,
  resolveInvitationPublicationAssets,
} from "../media/publication-assets";
import {
  InvitationDraftConflictError,
  InvitationDraftPersistenceError,
  loadInvitationDraft,
  TemplateUnavailableError,
} from "./drafts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const uuidSchema = z.string().uuid();
const UNCLAIMED_PUBLICATION_STALE_AFTER_MS = 60 * 1_000;
const STARTED_PUBLICATION_STALE_AFTER_MS = 6 * 60 * 1_000;
const requestPublicationInputSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  idempotencyKey: uuidSchema,
  invitationId: uuidSchema,
});

const publicationVersionStatusSchema = z.strictObject({
  draft_revision: z.number().int().positive(),
  id: uuidSchema,
});
const publicationBuildStatusSchema = z.strictObject({
  attempt_count: z.number().int().nonnegative().optional().default(0),
  created_at: z.string().datetime({ offset: true }).nullable().optional().default(null),
  error_code: z.string().nullable(),
  last_started_at: z.string().datetime({ offset: true }).nullable().optional().default(null),
  status: z.enum(["pending", "completed", "failed"]),
});
const publicationAliasStatusSchema = z.strictObject({
  active_publication_id: uuidSchema.nullable(),
  delivered_publication_id: uuidSchema.nullable(),
  delivery_error_code: z.string().nullable(),
  delivery_status: z.enum(["idle", "pending", "retrying", "failed", "delivered"]),
  public_identifier: z.string().regex(/^[0-9a-f]{32}$/),
});
const publicationVersionListSchema = z.array(
  publicationVersionStatusSchema.extend({
    invitation_id: uuidSchema,
    publication_number: z.number().int().positive(),
  }),
);
const publicationBuildListSchema = z.array(
  publicationBuildStatusSchema.extend({ publication_id: uuidSchema }),
);
const publicationAliasListSchema = z.array(
  publicationAliasStatusSchema.extend({ invitation_id: uuidSchema }),
);

export interface InvitationPublicationStatus {
  readonly errorCode: string | null;
  readonly livePublicIdentifier: string | null;
  readonly publicationId: string | null;
  readonly publishedRevision: number | null;
  readonly status: "idle" | "publishing" | "retrying" | "failed" | "delivered";
}

export class PublicationPersistenceError extends Error {
  constructor() {
    super("The publication request could not be saved.");
    this.name = "PublicationPersistenceError";
  }
}

export class PublicationAssetsUnavailableError extends Error {
  constructor() {
    super("This invitation has unresolved assets and cannot be published yet.");
    this.name = "PublicationAssetsUnavailableError";
  }
}

function publicationBuildIsStale(build: z.infer<typeof publicationBuildStatusSchema>, now: number) {
  if (build.status !== "pending") return false;
  const lastActivity = build.last_started_at ?? build.created_at;
  if (!lastActivity) return false;
  const staleAfter =
    build.attempt_count === 0
      ? UNCLAIMED_PUBLICATION_STALE_AFTER_MS
      : STARTED_PUBLICATION_STALE_AFTER_MS;
  return Date.parse(lastActivity) <= now - staleAfter;
}

function deriveInvitationPublicationStatus(
  version: z.infer<typeof publicationVersionStatusSchema>,
  build: z.infer<typeof publicationBuildStatusSchema>,
  alias: z.infer<typeof publicationAliasStatusSchema>,
  now = Date.now(),
): InvitationPublicationStatus {
  const livePublicIdentifier = alias.delivered_publication_id ? alias.public_identifier : null;

  if (build.status === "failed" || publicationBuildIsStale(build, now)) {
    return {
      errorCode: build.error_code ?? "publication_stalled",
      livePublicIdentifier,
      publicationId: version.id,
      publishedRevision: version.draft_revision,
      status: "failed",
    };
  }

  if (
    alias.delivery_status === "delivered" &&
    alias.active_publication_id === version.id &&
    alias.delivered_publication_id === version.id
  ) {
    return {
      errorCode: null,
      livePublicIdentifier,
      publicationId: version.id,
      publishedRevision: version.draft_revision,
      status: "delivered",
    };
  }

  const failed = alias.active_publication_id === version.id && alias.delivery_status === "failed";
  return {
    errorCode: failed ? alias.delivery_error_code : null,
    livePublicIdentifier,
    publicationId: version.id,
    publishedRevision: version.draft_revision,
    status: failed ? "failed" : alias.delivery_status === "retrying" ? "retrying" : "publishing",
  };
}

export async function requestInvitationPublication(
  supabase: SupabaseServerClient,
  input: unknown,
  options: { readonly store?: MediaObjectStore } = {},
) {
  const parsed = requestPublicationInputSchema.parse(input);
  const draft = await loadInvitationDraft(supabase, parsed.invitationId);

  if (!draft) {
    throw new InvitationDraftPersistenceError();
  }

  if (draft.revision !== parsed.expectedRevision) {
    throw new InvitationDraftConflictError();
  }

  if (draft.manifest.qualityStatus !== "production") {
    throw new TemplateUnavailableError();
  }

  let assets: PublicationAssetManifestEntry[] = [];
  if (draft.document.assets.length > 0) {
    const store = options.store ?? new R2MediaObjectStore(readR2MediaConfig());
    try {
      assets = await resolveInvitationPublicationAssets(supabase, store, {
        documentAssets: draft.document.assets,
        invitationId: parsed.invitationId,
      });
    } catch (error) {
      if (error instanceof PublicationMediaUnavailableError) {
        throw new PublicationAssetsUnavailableError();
      }
      throw error;
    }
  }

  const renderer = resolveTemplateRendererRegistration(draft.manifest.rendererKey);
  const snapshot = parsePublicationSnapshot({
    snapshotVersion: CURRENT_PUBLICATION_SNAPSHOT_VERSION,
    invitationSchemaVersion: draft.document.schemaVersion,
    rendererKey: draft.manifest.rendererKey,
    rendererVersion: renderer.version,
    templateVersionId: draft.manifest.templateVersionId,
    templateVersion: draft.manifest.version,
    draftRevision: draft.revision,
    document: draft.document,
    assets,
  });
  const { data, error } = await supabase.rpc("request_invitation_publication", {
    p_expected_draft_revision: parsed.expectedRevision,
    p_idempotency_key: parsed.idempotencyKey,
    p_invitation_id: parsed.invitationId,
    p_snapshot: snapshot,
  });

  if (error?.code === "40001") {
    throw new InvitationDraftConflictError();
  }

  if (error) {
    throw new PublicationPersistenceError();
  }

  return {
    publicationId: uuidSchema.parse(data),
    snapshot,
  };
}

export async function loadInvitationPublicationStatus(
  supabase: SupabaseServerClient,
  invitationId: string,
): Promise<InvitationPublicationStatus> {
  const parsedInvitationId = uuidSchema.parse(invitationId);
  const versionResponse = await supabase
    .from("publication_versions")
    .select("id, draft_revision")
    .eq("invitation_id", parsedInvitationId)
    .order("publication_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionResponse.error) throw new PublicationPersistenceError();
  if (!versionResponse.data) {
    return {
      errorCode: null,
      livePublicIdentifier: null,
      publicationId: null,
      publishedRevision: null,
      status: "idle",
    };
  }

  const version = publicationVersionStatusSchema.parse(versionResponse.data);
  const [buildResponse, aliasResponse] = await Promise.all([
    supabase
      .from("publication_builds")
      .select("status, error_code, attempt_count, created_at, last_started_at")
      .eq("publication_id", version.id)
      .maybeSingle(),
    supabase
      .from("publication_aliases")
      .select(
        "active_publication_id, delivered_publication_id, delivery_error_code, delivery_status, public_identifier",
      )
      .eq("invitation_id", parsedInvitationId)
      .maybeSingle(),
  ]);

  if (buildResponse.error || aliasResponse.error) throw new PublicationPersistenceError();
  const build = publicationBuildStatusSchema.parse(buildResponse.data);
  const alias = publicationAliasStatusSchema.parse(aliasResponse.data);
  return deriveInvitationPublicationStatus(version, build, alias);
}

export async function listInvitationPublicationStatuses(
  supabase: SupabaseServerClient,
  workspaceId: string,
): Promise<Record<string, InvitationPublicationStatus>> {
  const parsedWorkspaceId = uuidSchema.parse(workspaceId);
  const [versionResponse, buildResponse, aliasResponse] = await Promise.all([
    supabase
      .from("publication_versions")
      .select("id, invitation_id, draft_revision, publication_number")
      .eq("workspace_id", parsedWorkspaceId),
    supabase
      .from("publication_builds")
      .select("publication_id, status, error_code, attempt_count, created_at, last_started_at")
      .eq("workspace_id", parsedWorkspaceId),
    supabase
      .from("publication_aliases")
      .select(
        "invitation_id, active_publication_id, delivered_publication_id, delivery_error_code, delivery_status, public_identifier",
      )
      .eq("workspace_id", parsedWorkspaceId),
  ]);

  if (versionResponse.error || buildResponse.error || aliasResponse.error) {
    throw new PublicationPersistenceError();
  }

  const latestVersions = new Map<string, z.infer<typeof publicationVersionListSchema>[number]>();
  for (const version of publicationVersionListSchema.parse(versionResponse.data ?? [])) {
    const current = latestVersions.get(version.invitation_id);
    if (!current || version.publication_number > current.publication_number) {
      latestVersions.set(version.invitation_id, version);
    }
  }

  const builds = new Map(
    publicationBuildListSchema
      .parse(buildResponse.data ?? [])
      .map((build) => [build.publication_id, build] as const),
  );
  const aliases = new Map(
    publicationAliasListSchema
      .parse(aliasResponse.data ?? [])
      .map((alias) => [alias.invitation_id, alias] as const),
  );
  const statuses: Record<string, InvitationPublicationStatus> = {};

  for (const [invitationId, version] of latestVersions) {
    const build = builds.get(version.id);
    const alias = aliases.get(invitationId);
    if (!build || !alias) throw new PublicationPersistenceError();
    statuses[invitationId] = deriveInvitationPublicationStatus(version, build, alias);
  }

  return statuses;
}
