import {
  MAX_PUBLICATION_ALIAS_BYTES,
  MAX_PUBLICATION_ARTIFACT_BYTES,
  type PublicationAlias,
  type PublicationArtifact,
  PublicationArtifactConflictError,
  type PublicationObjectStore,
  publicationAliasKey,
  publicationArtifactKey,
  publicationSha256Hex,
  writeVerifiedPublicationAlias,
  writeVerifiedPublicationArtifact,
} from "@invitica/invitation-schema";

export const MAX_ALIAS_BYTES = MAX_PUBLICATION_ALIAS_BYTES;
export const MAX_ARTIFACT_BYTES = MAX_PUBLICATION_ARTIFACT_BYTES;

export type { PublicationObjectStore };
export {
  PublicationArtifactConflictError,
  publicationAliasKey,
  publicationArtifactKey,
  publicationSha256Hex as sha256Hex,
};

export interface WritePublicationArtifactsInput {
  readonly publicIdentifier: string;
  readonly publicationId: string;
  readonly snapshot: unknown;
}

export function createWorkerPublicationObjectStore(bucket: R2Bucket): PublicationObjectStore {
  return {
    async get(key) {
      const object = await bucket.get(key);
      if (!object) {
        return null;
      }

      return { body: await object.text(), size: object.size, version: object.etag };
    },
    async put(key, body, options) {
      const putOptions: R2PutOptions = {
        httpMetadata: {
          cacheControl: options.cacheControl,
          contentType: options.contentType,
        },
        customMetadata: { ...options.metadata },
      };

      if (options.onlyIfAbsent) {
        putOptions.onlyIf = new Headers({ "if-none-match": "*" });
      } else if (options.ifMatch) {
        putOptions.onlyIf = new Headers({ "if-match": options.ifMatch });
      }

      if (options.sha256) {
        putOptions.sha256 = options.sha256;
      }

      const result = await bucket.put(key, body, putOptions);
      return { version: result?.etag ?? null, written: result !== null };
    },
  };
}

export async function writePublicationArtifacts(
  store: PublicationObjectStore | R2Bucket,
  input: WritePublicationArtifactsInput,
): Promise<{ alias: PublicationAlias; artifact: PublicationArtifact }> {
  const objectStore = "head" in store ? createWorkerPublicationObjectStore(store) : store;
  const artifact = await writeVerifiedPublicationArtifact(objectStore, input);
  const alias = await writeVerifiedPublicationAlias(objectStore, {
    artifactKey: artifact.key,
    artifactSha256: artifact.sha256,
    publicationId: artifact.artifact.publicationId,
    publicIdentifier: input.publicIdentifier,
  });

  return { alias: alias.alias, artifact: artifact.artifact };
}
