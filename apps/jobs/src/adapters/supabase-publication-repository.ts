import { parsePublicationSnapshot } from "@invitica/invitation-schema";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { PublicationJobRecord, PublicationJobRepository } from "../orchestrate-publication.js";

const uuidSchema = z.string().uuid();
const publicationVersionSchema = z.strictObject({
  id: uuidSchema,
  invitation_id: uuidSchema,
  snapshot: z.unknown(),
});
const publicationAliasSchema = z.strictObject({
  active_publication_id: uuidSchema.nullable(),
  delivered_publication_id: uuidSchema.nullable(),
  public_identifier: z.string().regex(/^[0-9a-f]{32}$/),
});
const publicationBuildSchema = z.strictObject({
  artifact_key: z.string().min(1).max(512).nullable(),
  artifact_sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
});

export class PublicationJobPersistenceError extends Error {
  constructor() {
    super("Publication persistence operation failed.");
    this.name = "PublicationJobPersistenceError";
  }
}

function assertProviderSuccess(error: unknown): void {
  if (error) throw new PublicationJobPersistenceError();
}

export class SupabasePublicationJobRepository implements PublicationJobRepository {
  readonly #client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.#client = client;
  }

  async loadPublication(publicationId: string): Promise<PublicationJobRecord> {
    const versionResponse = await this.#client
      .from("publication_versions")
      .select("id, invitation_id, snapshot")
      .eq("id", publicationId)
      .maybeSingle();
    assertProviderSuccess(versionResponse.error);
    const version = publicationVersionSchema.safeParse(versionResponse.data);
    if (!version.success) throw new PublicationJobPersistenceError();

    const aliasResponse = await this.#client
      .from("publication_aliases")
      .select("active_publication_id, delivered_publication_id, public_identifier")
      .eq("invitation_id", version.data.invitation_id)
      .maybeSingle();
    assertProviderSuccess(aliasResponse.error);
    const alias = publicationAliasSchema.safeParse(aliasResponse.data);
    if (!alias.success) throw new PublicationJobPersistenceError();

    let deliveredArtifactKey: string | null = null;
    let deliveredArtifactSha256: string | null = null;
    if (alias.data.delivered_publication_id) {
      const buildResponse = await this.#client
        .from("publication_builds")
        .select("artifact_key, artifact_sha256")
        .eq("publication_id", alias.data.delivered_publication_id)
        .maybeSingle();
      assertProviderSuccess(buildResponse.error);
      const build = publicationBuildSchema.safeParse(buildResponse.data);
      if (!build.success || !build.data.artifact_key || !build.data.artifact_sha256) {
        throw new PublicationJobPersistenceError();
      }
      deliveredArtifactKey = build.data.artifact_key;
      deliveredArtifactSha256 = build.data.artifact_sha256;
    }

    return {
      id: version.data.id,
      snapshot: parsePublicationSnapshot(version.data.snapshot),
      publicIdentifier: alias.data.public_identifier,
      activePublicationId: alias.data.active_publication_id,
      deliveredPublicationId: alias.data.delivered_publication_id,
      deliveredArtifactKey,
      deliveredArtifactSha256,
    };
  }

  async startBuild(publicationId: string): Promise<void> {
    const response = await this.#client.rpc("start_invitation_publication", {
      p_publication_id: publicationId,
    });
    assertProviderSuccess(response.error);
  }

  async completeBuild(
    publicationId: string,
    artifactKey: string,
    artifactSha256: string,
  ): Promise<void> {
    const response = await this.#client.rpc("complete_invitation_publication", {
      p_artifact_key: artifactKey,
      p_artifact_sha256: artifactSha256,
      p_publication_id: publicationId,
    });
    assertProviderSuccess(response.error);
  }

  async failBuild(publicationId: string, errorCode: string): Promise<void> {
    const response = await this.#client.rpc("fail_invitation_publication", {
      p_error_code: errorCode,
      p_publication_id: publicationId,
    });
    assertProviderSuccess(response.error);
  }

  async selectDelivery(publicationId: string): Promise<boolean> {
    return this.#booleanRpc("select_invitation_publication_delivery", {
      p_publication_id: publicationId,
    });
  }

  async recordDeliveryFailure(
    publicationId: string,
    errorCode: string,
    isTerminal: boolean,
  ): Promise<boolean> {
    return this.#booleanRpc("record_invitation_publication_delivery_failure", {
      p_error_code: errorCode,
      p_is_terminal: isTerminal,
      p_publication_id: publicationId,
    });
  }

  async confirmDelivery(publicationId: string): Promise<boolean> {
    return this.#booleanRpc("confirm_invitation_publication_delivery", {
      p_publication_id: publicationId,
    });
  }

  async #booleanRpc(name: string, parameters: Record<string, boolean | string>): Promise<boolean> {
    const response = await this.#client.rpc(name, parameters);
    assertProviderSuccess(response.error);
    const parsed = z.boolean().safeParse(response.data);
    if (!parsed.success) throw new PublicationJobPersistenceError();
    return parsed.data;
  }
}

export function createSupabasePublicationJobRepository(
  url: string,
  serviceRoleKey: string,
): SupabasePublicationJobRepository {
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return new SupabasePublicationJobRepository(client);
}
