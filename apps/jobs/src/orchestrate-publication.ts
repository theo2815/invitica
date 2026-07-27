import {
  PublicationAliasConflictError,
  PublicationAliasVerificationError,
  PublicationArtifactConflictError,
  type PublicationObjectStore,
  type PublicationSnapshot,
  parsePublicationAlias,
  publicationAliasKey,
  writeVerifiedPublicationAlias,
  writeVerifiedPublicationArtifact,
} from "@invitica/invitation-schema";
import {
  createPublicationSocialPreview,
  PublicationSocialPreviewError,
  type PublicationSocialPreviewStore,
} from "./social-preview.js";

export interface PublicationJobRecord {
  readonly id: string;
  readonly snapshot: PublicationSnapshot;
  readonly publicIdentifier: string;
  readonly activePublicationId: string | null;
  readonly deliveredPublicationId: string | null;
  readonly deliveredArtifactKey: string | null;
  readonly deliveredArtifactSha256: string | null;
}

export interface PublicationJobRepository {
  loadPublication(publicationId: string): Promise<PublicationJobRecord>;
  startBuild(publicationId: string): Promise<void>;
  completeBuild(publicationId: string, artifactKey: string, artifactSha256: string): Promise<void>;
  failBuild(publicationId: string, errorCode: string): Promise<void>;
  selectDelivery(publicationId: string): Promise<boolean>;
  recordDeliveryFailure(
    publicationId: string,
    errorCode: string,
    isTerminal: boolean,
  ): Promise<boolean>;
  confirmDelivery(publicationId: string): Promise<boolean>;
}

export interface PublicationJobLogger {
  info(message: string, attributes: Readonly<Record<string, string | number | boolean>>): void;
  error(message: string, attributes: Readonly<Record<string, string | number | boolean>>): void;
}

export interface PublicationJobOptions {
  readonly attemptNumber: number;
  readonly maxAttempts: number;
}

export interface PublicationDeliveryObjectStore
  extends PublicationObjectStore,
    PublicationSocialPreviewStore {
  deleteIfVersion(key: string, version: string): Promise<boolean>;
}

export type PublicationJobResult =
  | { readonly status: "delivered"; readonly publicationId: string }
  | { readonly status: "stale"; readonly publicationId: string };

function publicationFailureCode(error: unknown): string {
  if (error instanceof PublicationArtifactConflictError) return "artifact_conflict";
  if (error instanceof PublicationAliasConflictError) return "alias_conflict";
  if (error instanceof PublicationAliasVerificationError) return "alias_verification_failed";
  if (error instanceof PublicationSocialPreviewError) return "social_preview_failed";
  return "publication_job_failed";
}

function isTerminalFailure(error: unknown, options: PublicationJobOptions): boolean {
  return (
    error instanceof PublicationArtifactConflictError ||
    options.attemptNumber >= options.maxAttempts
  );
}

async function restorePreviousAlias(
  store: PublicationDeliveryObjectStore,
  publication: PublicationJobRecord,
  candidatePublicationId: string,
): Promise<void> {
  const key = publicationAliasKey(publication.publicIdentifier);
  const current = await store.get(key);
  if (!current) return;

  const currentAlias = parsePublicationAlias(JSON.parse(current.body) as unknown);
  if (currentAlias.publicationId !== candidatePublicationId) return;

  if (
    !publication.deliveredPublicationId ||
    !publication.deliveredArtifactKey ||
    !publication.deliveredArtifactSha256
  ) {
    if (!current.version || !(await store.deleteIfVersion(key, current.version))) {
      throw new PublicationAliasConflictError();
    }
    return;
  }

  await writeVerifiedPublicationAlias(store, {
    artifactKey: publication.deliveredArtifactKey,
    artifactSha256: publication.deliveredArtifactSha256,
    publicationId: publication.deliveredPublicationId,
    publicIdentifier: publication.publicIdentifier,
    expectedVersion: current.version,
  });
}

export async function orchestratePublication(
  repository: PublicationJobRepository,
  store: PublicationDeliveryObjectStore,
  logger: PublicationJobLogger,
  publicationId: string,
  options: PublicationJobOptions,
): Promise<PublicationJobResult> {
  const logAttributes = { attempt: options.attemptNumber, publicationId };
  let buildCompleted = false;
  let deliverySelected = false;
  let deliveryFailureRecorded = false;

  try {
    const publication = await repository.loadPublication(publicationId);
    logger.info("Publication build started", { ...logAttributes, stage: "build" });
    await repository.startBuild(publicationId);

    const socialPreview = await createPublicationSocialPreview(publication.snapshot, store);
    const artifact = await writeVerifiedPublicationArtifact(store, {
      publicationId,
      snapshot: publication.snapshot,
      socialPreview,
    });
    await repository.completeBuild(publicationId, artifact.key, artifact.sha256);
    buildCompleted = true;

    deliverySelected = await repository.selectDelivery(publicationId);
    if (!deliverySelected) {
      logger.info("Publication delivery skipped", { ...logAttributes, stage: "stale" });
      return { publicationId, status: "stale" };
    }

    const aliasObject = await store.get(publicationAliasKey(publication.publicIdentifier));
    await writeVerifiedPublicationAlias(store, {
      artifactKey: artifact.key,
      artifactSha256: artifact.sha256,
      publicationId,
      publicIdentifier: publication.publicIdentifier,
      expectedVersion: aliasObject?.version ?? null,
    });

    const confirmed = await repository.confirmDelivery(publicationId);
    if (!confirmed) {
      await restorePreviousAlias(store, publication, publicationId);
      logger.info("Publication delivery superseded", { ...logAttributes, stage: "confirm" });
      return { publicationId, status: "stale" };
    }

    logger.info("Publication delivery completed", { ...logAttributes, stage: "delivered" });
    return { publicationId, status: "delivered" };
  } catch (error) {
    const errorCode = publicationFailureCode(error);
    const terminal = isTerminalFailure(error, options);

    if (!buildCompleted) {
      await repository.failBuild(publicationId, errorCode);
    } else if (deliverySelected) {
      deliveryFailureRecorded = await repository.recordDeliveryFailure(
        publicationId,
        errorCode,
        terminal,
      );
    }

    logger.error("Publication job failed", {
      ...logAttributes,
      errorCode,
      stage: buildCompleted ? "delivery" : "build",
      terminal,
      transitionRecorded: buildCompleted ? deliveryFailureRecorded : true,
    });
    throw error;
  }
}
