import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  PublicationObjectWriteOptions,
  StoredPublicationObject,
} from "@invitica/invitation-schema";
import type { PublicationDeliveryObjectStore } from "../orchestrate-publication.js";

export interface R2PublicationObjectStoreOptions {
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
}

function isPreconditionFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    readonly name?: unknown;
    readonly $metadata?: { httpStatusCode?: unknown };
  };
  return candidate.name === "PreconditionFailed" || candidate.$metadata?.httpStatusCode === 412;
}

export class R2PublicationObjectStore implements PublicationDeliveryObjectStore {
  readonly #bucket: string;
  readonly #client: S3Client;

  constructor(options: R2PublicationObjectStoreOptions) {
    this.#bucket = options.bucket;
    this.#client = new S3Client({
      endpoint: options.endpoint,
      region: "auto",
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async get(key: string): Promise<StoredPublicationObject | null> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      const body = await response.Body?.transformToString();
      if (body === undefined) return null;
      return {
        body,
        size: response.ContentLength ?? new TextEncoder().encode(body).byteLength,
        version: response.ETag ?? null,
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error.name === "NoSuchKey" || error.name === "NotFound")
      ) {
        return null;
      }
      throw error;
    }
  }

  async put(
    key: string,
    body: string,
    options: PublicationObjectWriteOptions,
  ): Promise<{ readonly version: string | null; readonly written: boolean }> {
    try {
      const response = await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          Body: body,
          CacheControl: options.cacheControl,
          ContentType: options.contentType,
          Metadata: { ...options.metadata },
          ...(options.ifMatch ? { IfMatch: options.ifMatch } : {}),
          ...(options.onlyIfAbsent ? { IfNoneMatch: "*" } : {}),
        }),
      );
      return { version: response.ETag ?? null, written: true };
    } catch (error) {
      if (isPreconditionFailure(error)) return { version: null, written: false };
      throw error;
    }
  }

  async deleteIfVersion(key: string, version: string): Promise<boolean> {
    try {
      await this.#client.send(
        new DeleteObjectCommand({ Bucket: this.#bucket, IfMatch: version, Key: key }),
      );
      return true;
    } catch (error) {
      if (isPreconditionFailure(error)) return false;
      throw error;
    }
  }
}
