import { z } from "zod";

import { CURRENT_INVITATION_SCHEMA_VERSION, invitationDocumentV1Schema } from "./document.js";

export const CURRENT_PUBLICATION_SNAPSHOT_VERSION = 1 as const;
export const CURRENT_PUBLICATION_ARTIFACT_VERSION = 2 as const;
export const CURRENT_PUBLICATION_ALIAS_VERSION = 1 as const;
export const MAX_PUBLICATION_ALIAS_BYTES = 4_096;
export const MAX_PUBLICATION_ARTIFACT_BYTES = 1_000_000;
export const MAX_PUBLICATION_SOCIAL_PREVIEW_BYTES = 1_500_000;

export const publicationPublicIdentifierSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/, "Expected 128 bits of lowercase hexadecimal identifier material");

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "Expected a lowercase SHA-256 digest");
const objectKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/, "Expected a safe object-storage key")
  .refine((key) => !key.includes("..") && !key.includes("//"), "Unsafe object-storage key");

const imageContentTypeSchema = z.enum(["image/avif", "image/jpeg", "image/png", "image/webp"]);
const audioContentTypeSchema = z.enum(["audio/mp4", "audio/mpeg", "audio/ogg"]);

const positiveSafeIntSchema = z.number().int().positive().safe();

export const publicationImageRenditionSchema = z.strictObject({
  width: positiveSafeIntSchema,
  height: positiveSafeIntSchema,
  objectKey: objectKeySchema,
  byteLength: positiveSafeIntSchema,
  sha256: sha256Schema,
});

export const publicationAssetManifestEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: uuidSchema,
    kind: z.literal("image"),
    contentType: imageContentTypeSchema,
    width: positiveSafeIntSchema,
    height: positiveSafeIntSchema,
    renditions: z.array(publicationImageRenditionSchema).min(1).max(4),
  }),
  z.strictObject({
    id: uuidSchema,
    kind: z.literal("audio"),
    objectKey: objectKeySchema,
    contentType: audioContentTypeSchema,
    byteLength: positiveSafeIntSchema,
    sha256: sha256Schema,
  }),
]);

export const publicationSnapshotV1Schema = z
  .strictObject({
    snapshotVersion: z.literal(CURRENT_PUBLICATION_SNAPSHOT_VERSION),
    invitationSchemaVersion: z.literal(CURRENT_INVITATION_SCHEMA_VERSION),
    rendererKey: z.string().trim().min(1).max(100),
    rendererVersion: z.number().int().positive().safe(),
    templateVersionId: uuidSchema,
    templateVersion: z.number().int().positive().safe(),
    draftRevision: z.number().int().positive().safe(),
    document: invitationDocumentV1Schema,
    assets: z.array(publicationAssetManifestEntrySchema).max(100),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.document.schemaVersion !== snapshot.invitationSchemaVersion) {
      context.addIssue({
        code: "custom",
        message: "Snapshot schema version must match its invitation document",
        path: ["invitationSchemaVersion"],
      });
    }

    if (snapshot.document.templateVersionId !== snapshot.templateVersionId) {
      context.addIssue({
        code: "custom",
        message: "Snapshot template version must match its invitation document",
        path: ["templateVersionId"],
      });
    }

    const documentAssets = new Map(snapshot.document.assets.map((asset) => [asset.id, asset.kind]));
    const manifestAssets = new Map<string, string>();

    snapshot.assets.forEach((asset, index) => {
      if (manifestAssets.has(asset.id)) {
        context.addIssue({
          code: "custom",
          message: "Publication asset IDs must be unique",
          path: ["assets", index, "id"],
        });
      }

      manifestAssets.set(asset.id, asset.kind);

      if (documentAssets.get(asset.id) !== asset.kind) {
        context.addIssue({
          code: "custom",
          message: "Publication assets must match the invitation document",
          path: ["assets", index, "id"],
        });
      }
    });

    snapshot.document.assets.forEach((asset) => {
      if (manifestAssets.get(asset.id) !== asset.kind) {
        context.addIssue({
          code: "custom",
          message: "Every document asset requires one publication manifest entry",
          path: ["assets"],
        });
      }
    });
  });

export type PublicationImageRendition = z.infer<typeof publicationImageRenditionSchema>;
export type PublicationAssetManifestEntry = z.infer<typeof publicationAssetManifestEntrySchema>;
export type PublicationSnapshotV1 = z.infer<typeof publicationSnapshotV1Schema>;
export type PublicationSnapshot = PublicationSnapshotV1;

export const publicationArtifactV1Schema = z.strictObject({
  artifactVersion: z.literal(1),
  publicationId: uuidSchema,
  snapshot: publicationSnapshotV1Schema,
});

export const publicationSocialPreviewSchema = z
  .strictObject({
    byteLength: positiveSafeIntSchema.max(MAX_PUBLICATION_SOCIAL_PREVIEW_BYTES),
    contentType: z.literal("image/jpeg"),
    height: z.literal(630),
    objectKey: objectKeySchema,
    sha256: sha256Schema,
    width: z.literal(1200),
  })
  .refine(
    (preview) => preview.objectKey === `publication-social/v1/${preview.sha256}.jpg`,
    "Social preview object key must match its content digest",
  );

export const publicationArtifactV2Schema = z.strictObject({
  artifactVersion: z.literal(CURRENT_PUBLICATION_ARTIFACT_VERSION),
  publicationId: uuidSchema,
  snapshot: publicationSnapshotV1Schema,
  socialPreview: publicationSocialPreviewSchema,
});

const publicationArtifactSchema = z.discriminatedUnion("artifactVersion", [
  publicationArtifactV1Schema,
  publicationArtifactV2Schema,
]);

export const publicationAliasV1Schema = z.strictObject({
  aliasVersion: z.literal(CURRENT_PUBLICATION_ALIAS_VERSION),
  publicationId: uuidSchema,
  artifactKey: objectKeySchema,
  artifactSha256: sha256Schema,
});

export type PublicationArtifactV1 = z.infer<typeof publicationArtifactV1Schema>;
export type PublicationArtifactV2 = z.infer<typeof publicationArtifactV2Schema>;
export type PublicationArtifact = PublicationArtifactV1 | PublicationArtifactV2;
export type PublicationSocialPreview = z.infer<typeof publicationSocialPreviewSchema>;
export type PublicationAliasV1 = z.infer<typeof publicationAliasV1Schema>;
export type PublicationAlias = PublicationAliasV1;

export interface StoredPublicationObject {
  readonly body: string;
  readonly size: number;
  readonly version: string | null;
}

export interface PublicationObjectWriteOptions {
  readonly cacheControl: string;
  readonly contentType: "application/json; charset=utf-8";
  readonly metadata: Readonly<Record<string, string>>;
  readonly ifMatch?: string;
  readonly onlyIfAbsent: boolean;
  readonly sha256?: string;
}

export interface PublicationObjectStore {
  get(key: string): Promise<StoredPublicationObject | null>;
  put(
    key: string,
    body: string,
    options: PublicationObjectWriteOptions,
  ): Promise<{ readonly version: string | null; readonly written: boolean }>;
}

export interface PublicationArtifactWriteResult {
  readonly artifact: PublicationArtifact;
  readonly body: string;
  readonly key: string;
  readonly sha256: string;
}

export interface PublicationAliasWriteResult {
  readonly alias: PublicationAlias;
  readonly version: string | null;
}

export class UnsupportedPublicationSnapshotVersionError extends Error {
  readonly snapshotVersion: unknown;

  constructor(snapshotVersion: unknown) {
    super(`Unsupported publication snapshot version: ${String(snapshotVersion)}`);
    this.name = "UnsupportedPublicationSnapshotVersionError";
    this.snapshotVersion = snapshotVersion;
  }
}

export class PublicationArtifactConflictError extends Error {
  constructor() {
    super("An immutable publication artifact already exists with different content.");
    this.name = "PublicationArtifactConflictError";
  }
}

export class PublicationArtifactVerificationError extends Error {
  constructor() {
    super("The publication artifact could not be verified.");
    this.name = "PublicationArtifactVerificationError";
  }
}

export class PublicationAliasVerificationError extends Error {
  constructor() {
    super("The publication alias could not be verified.");
    this.name = "PublicationAliasVerificationError";
  }
}

export class PublicationAliasConflictError extends Error {
  constructor() {
    super("The publication alias changed before it could be replaced.");
    this.name = "PublicationAliasConflictError";
  }
}

export function parsePublicationSnapshot(input: unknown): PublicationSnapshot {
  if (typeof input !== "object" || input === null || !("snapshotVersion" in input)) {
    throw new UnsupportedPublicationSnapshotVersionError(undefined);
  }

  if (input.snapshotVersion !== CURRENT_PUBLICATION_SNAPSHOT_VERSION) {
    throw new UnsupportedPublicationSnapshotVersionError(input.snapshotVersion);
  }

  return publicationSnapshotV1Schema.parse(input);
}

export function parsePublicationArtifact(input: unknown): PublicationArtifact {
  return publicationArtifactSchema.parse(input);
}

export function parsePublicationAlias(input: unknown): PublicationAlias {
  return publicationAliasV1Schema.parse(input);
}

export function publicationArtifactKey(publicationId: string, artifactVersion: 1 | 2 = 1): string {
  return `publication-artifacts/v${artifactVersion}/${uuidSchema.parse(publicationId)}.json`;
}

export function publicationSocialPreviewObjectKey(sha256: string): string {
  return objectKeySchema.parse(`publication-social/v1/${sha256Schema.parse(sha256)}.jpg`);
}

export function publicationAliasKey(publicIdentifier: string): string {
  const identifier = publicationPublicIdentifierSchema.parse(publicIdentifier);
  return `publication-aliases/v1/${identifier}.json`;
}

export async function publicationSha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicationByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseStoredJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}

export async function writeVerifiedPublicationArtifact(
  store: PublicationObjectStore,
  input:
    | {
        readonly artifactVersion: 1;
        readonly publicationId: string;
        readonly snapshot: unknown;
      }
    | {
        readonly artifactVersion?: 2;
        readonly publicationId: string;
        readonly snapshot: unknown;
        readonly socialPreview: unknown;
      },
): Promise<PublicationArtifactWriteResult> {
  const artifact = parsePublicationArtifact(
    "socialPreview" in input
      ? {
          artifactVersion: CURRENT_PUBLICATION_ARTIFACT_VERSION,
          publicationId: input.publicationId,
          snapshot: input.snapshot,
          socialPreview: input.socialPreview,
        }
      : {
          artifactVersion: 1,
          publicationId: input.publicationId,
          snapshot: input.snapshot,
        },
  );
  const key = publicationArtifactKey(artifact.publicationId, artifact.artifactVersion);
  const body = JSON.stringify(artifact);
  const size = publicationByteLength(body);

  if (size > MAX_PUBLICATION_ARTIFACT_BYTES) {
    throw new PublicationArtifactVerificationError();
  }

  const sha256 = await publicationSha256Hex(body);
  await store.put(key, body, {
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "application/json; charset=utf-8",
    metadata: {
      artifactVersion: String(artifact.artifactVersion),
      sha256,
    },
    onlyIfAbsent: true,
    sha256,
  });

  const stored = await store.get(key);
  if (!stored || stored.size > MAX_PUBLICATION_ARTIFACT_BYTES) {
    throw new PublicationArtifactVerificationError();
  }

  const storedSha256 = await publicationSha256Hex(stored.body);
  if (stored.body !== body || storedSha256 !== sha256) {
    throw new PublicationArtifactConflictError();
  }

  parsePublicationArtifact(parseStoredJson(stored.body));
  return { artifact, body, key, sha256 };
}

export async function writeVerifiedPublicationAlias(
  store: PublicationObjectStore,
  input: {
    readonly artifactKey: string;
    readonly artifactSha256: string;
    readonly publicationId: string;
    readonly publicIdentifier: string;
    readonly expectedVersion?: string | null;
  },
): Promise<PublicationAliasWriteResult> {
  const key = publicationAliasKey(input.publicIdentifier);
  const alias = parsePublicationAlias({
    aliasVersion: CURRENT_PUBLICATION_ALIAS_VERSION,
    publicationId: input.publicationId,
    artifactKey: input.artifactKey,
    artifactSha256: input.artifactSha256,
  });
  const body = JSON.stringify(alias);

  if (publicationByteLength(body) > MAX_PUBLICATION_ALIAS_BYTES) {
    throw new PublicationAliasVerificationError();
  }

  const condition =
    input.expectedVersion === null
      ? { onlyIfAbsent: true as const }
      : input.expectedVersion
        ? { ifMatch: input.expectedVersion, onlyIfAbsent: false as const }
        : { onlyIfAbsent: false as const };
  const written = await store.put(key, body, {
    cacheControl: "public, max-age=60",
    contentType: "application/json; charset=utf-8",
    metadata: { aliasVersion: String(CURRENT_PUBLICATION_ALIAS_VERSION) },
    ...condition,
  });

  if (!written.written) {
    throw new PublicationAliasConflictError();
  }

  const stored = await store.get(key);
  if (!stored || stored.size > MAX_PUBLICATION_ALIAS_BYTES || stored.body !== body) {
    throw new PublicationAliasVerificationError();
  }

  const verified = parsePublicationAlias(parseStoredJson(stored.body));
  if (verified.publicationId !== alias.publicationId) {
    throw new PublicationAliasVerificationError();
  }

  return { alias: verified, version: stored.version };
}
