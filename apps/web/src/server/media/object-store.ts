import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod";

export interface MediaObjectPutOptions {
  readonly contentType: string;
  readonly cacheControl: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Narrow binary object surface for creator media. Kept separate from the
 * publication JSON store so image bytes and provider access stay isolated.
 */
export interface MediaObjectStore {
  put(key: string, body: Uint8Array, options: MediaObjectPutOptions): Promise<void>;
  copy(sourceKey: string, destinationKey: string, options: MediaObjectPutOptions): Promise<void>;
  head(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/**
 * Read side of the same bucket, kept separate from the write surface because
 * only the authenticated creator media route needs it. Draft renditions are
 * private objects, so reading one is always an authorized server action.
 */
export interface MediaObjectReader {
  get(key: string): Promise<Uint8Array | null>;
}

/** Private originals are never publicly cacheable. */
export const PRIVATE_MEDIA_CACHE_CONTROL = "private, no-store";
/** Content-addressed renditions are immutable and safe to cache indefinitely. */
export const IMMUTABLE_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

const r2MediaConfigSchema = z.strictObject({
  endpoint: z.string().url(),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  bucket: z.string().min(1),
});

export type R2MediaConfig = z.infer<typeof r2MediaConfigSchema>;

export function readR2MediaConfig(
  environment: Record<string, string | undefined> = process.env,
): R2MediaConfig {
  return r2MediaConfigSchema.parse({
    accessKeyId: environment.R2_ACCESS_KEY_ID,
    bucket: environment.R2_BUCKET_NAME,
    endpoint: environment.R2_ENDPOINT,
    secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
  });
}

export class R2MediaObjectStore implements MediaObjectStore, MediaObjectReader {
  readonly #bucket: string;
  readonly #client: S3Client;

  constructor(config: R2MediaConfig) {
    this.#bucket = config.bucket;
    this.#client = new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      region: "auto",
    });
  }

  async put(key: string, body: Uint8Array, options: MediaObjectPutOptions): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this.#bucket,
        CacheControl: options.cacheControl,
        ContentType: options.contentType,
        Key: key,
        ...(options.metadata ? { Metadata: { ...options.metadata } } : {}),
      }),
    );
  }

  async copy(
    sourceKey: string,
    destinationKey: string,
    options: MediaObjectPutOptions,
  ): Promise<void> {
    await this.#client.send(
      new CopyObjectCommand({
        Bucket: this.#bucket,
        CacheControl: options.cacheControl,
        ContentType: options.contentType,
        CopySource: `${this.#bucket}/${sourceKey}`,
        Key: destinationKey,
        MetadataDirective: "REPLACE",
        ...(options.metadata ? { Metadata: { ...options.metadata } } : {}),
      }),
    );
  }

  async head(key: string): Promise<boolean> {
    try {
      await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      // Renditions are capped at MAX_RENDITION_BYTES, so buffering one is
      // bounded and keeps the route free of stream plumbing.
      return (await result.Body?.transformToByteArray()) ?? null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    readonly name?: unknown;
    readonly $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
