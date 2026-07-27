import {
  MAX_PUBLICATION_ALIAS_BYTES,
  MAX_PUBLICATION_ARTIFACT_BYTES,
  type PublicationArtifact,
  type PublicationObjectStore,
  parsePublicationAlias,
  parsePublicationArtifact,
  publicationAliasKey,
  publicationArtifactKey,
  publicationSha256Hex,
} from "@invitica/invitation-schema";

import { createWorkerPublicationObjectStore } from "./artifacts";

const ALIAS_CACHE_SECONDS = 60;
const ARTIFACT_CACHE_SECONDS = 31_536_000;
const CACHE_ORIGIN = "https://viewer-cache.invitica.invalid";
const CACHE_NAME = "invitica-publications-v1";

export class PublicationUnavailableError extends Error {
  constructor() {
    super("The publication is unavailable.");
    this.name = "PublicationUnavailableError";
  }
}

export class PublicationStorageError extends Error {
  constructor() {
    super("Publication storage could not be reached.");
    this.name = "PublicationStorageError";
  }
}

function cacheRequest(kind: "alias" | "artifact", key: string): Request {
  return new Request(`${CACHE_ORIGIN}/${kind}/${encodeURIComponent(key)}`);
}

async function readCachedText(request: Request): Promise<string | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(request);
    return response ? response.text() : null;
  } catch {
    return null;
  }
}

function cacheText(request: Request, text: string, seconds: number, ctx: ExecutionContext): void {
  const write = caches
    .open(CACHE_NAME)
    .then((cache) =>
      cache.put(
        request,
        new Response(text, {
          headers: {
            "cache-control": `public, max-age=${seconds}`,
            "content-type": "application/json; charset=utf-8",
          },
        }),
      ),
    )
    .catch(() => {
      console.error(JSON.stringify({ event: "viewer_cache_write_failed" }));
    });
  ctx.waitUntil(write);
}

async function readObjectText(
  store: PublicationObjectStore,
  key: string,
  maximumBytes: number,
): Promise<string> {
  let stored: Awaited<ReturnType<PublicationObjectStore["get"]>>;

  try {
    stored = await store.get(key);
  } catch {
    throw new PublicationStorageError();
  }

  if (!stored || stored.size > maximumBytes) {
    throw new PublicationUnavailableError();
  }

  let text: string;

  try {
    text = stored.body;
  } catch {
    throw new PublicationStorageError();
  }

  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new PublicationUnavailableError();
  }

  return text;
}

async function loadText(
  store: PublicationObjectStore,
  kind: "alias" | "artifact",
  key: string,
  maximumBytes: number,
  cacheSeconds: number,
  ctx: ExecutionContext,
): Promise<string> {
  const request = cacheRequest(kind, key);
  const cached = await readCachedText(request);

  if (cached !== null) {
    return cached;
  }

  const text = await readObjectText(store, key, maximumBytes);
  cacheText(request, text, cacheSeconds, ctx);
  return text;
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    throw new PublicationUnavailableError();
  }
}

export async function loadActivePublication(
  store: PublicationObjectStore | R2Bucket,
  publicIdentifier: string,
  ctx: ExecutionContext,
): Promise<PublicationArtifact> {
  const objectStore = "head" in store ? createWorkerPublicationObjectStore(store) : store;
  try {
    const aliasText = await loadText(
      objectStore,
      "alias",
      publicationAliasKey(publicIdentifier),
      MAX_PUBLICATION_ALIAS_BYTES,
      ALIAS_CACHE_SECONDS,
      ctx,
    );
    const alias = parsePublicationAlias(parseJson(aliasText));
    const expectedArtifactKeys = [
      publicationArtifactKey(alias.publicationId, 1),
      publicationArtifactKey(alias.publicationId, 2),
    ];

    if (!expectedArtifactKeys.includes(alias.artifactKey)) {
      throw new PublicationUnavailableError();
    }

    const artifactText = await loadText(
      objectStore,
      "artifact",
      alias.artifactKey,
      MAX_PUBLICATION_ARTIFACT_BYTES,
      ARTIFACT_CACHE_SECONDS,
      ctx,
    );
    const artifactSha256 = await publicationSha256Hex(artifactText);

    if (artifactSha256 !== alias.artifactSha256) {
      throw new PublicationUnavailableError();
    }

    const artifact = parsePublicationArtifact(parseJson(artifactText));

    if (
      artifact.publicationId !== alias.publicationId ||
      alias.artifactKey !== publicationArtifactKey(artifact.publicationId, artifact.artifactVersion)
    ) {
      throw new PublicationUnavailableError();
    }

    return artifact;
  } catch (error: unknown) {
    if (error instanceof PublicationStorageError || error instanceof PublicationUnavailableError) {
      throw error;
    }

    throw new PublicationUnavailableError();
  }
}
