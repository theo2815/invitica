import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  type PublicationSnapshot,
  parsePublicationAlias,
  parsePublicationArtifact,
  publicationMediaObjectKey,
} from "@invitica/invitation-schema";
import { resolveTemplateRendererRegistration } from "@invitica/renderer";
import { resolveTemplateById } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";

import {
  createWorkerPublicationObjectStore,
  PublicationArtifactConflictError,
  type PublicationObjectStore,
  publicationAliasKey,
  publicationArtifactKey,
  sha256Hex,
  writePublicationArtifacts,
} from "../src/artifacts";
import { renderPublicationHtml } from "../src/html";
import worker from "../src/index";

const gardenPromise = resolveTemplateById("garden-promise");
const renderer = resolveTemplateRendererRegistration(gardenPromise.rendererKey);

function snapshot(
  title = "Mara & Joaquin",
  rendererVersion = renderer.version,
): PublicationSnapshot {
  return {
    snapshotVersion: 1,
    invitationSchemaVersion: 1,
    rendererKey: gardenPromise.rendererKey,
    rendererVersion,
    templateVersionId: gardenPromise.templateVersionId,
    templateVersion: gardenPromise.version,
    draftRevision: 4,
    document: {
      ...gardenPromise.defaultDocument,
      sections: gardenPromise.defaultDocument.sections.map((section) =>
        section.type === "hero"
          ? {
              ...section,
              props: {
                ...section.props,
                title,
              },
            }
          : section,
      ),
    },
    assets: [],
  };
}

async function publish(
  publicIdentifier: string,
  publicationId: string,
  publicationSnapshot: PublicationSnapshot = snapshot(),
) {
  return writePublicationArtifacts(env.PUBLICATION_BUCKET, {
    publicIdentifier,
    publicationId,
    snapshot: publicationSnapshot,
  });
}

async function fetchViewer(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const request = new Request(`https://invitica.app${path}`, init) as Request<
    unknown,
    IncomingRequestCfProperties
  >;
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function putAlias(
  publicIdentifier: string,
  publicationId: string,
  artifactBody: string | null,
): Promise<void> {
  const artifactKey = publicationArtifactKey(publicationId);
  const artifactSha256 = await sha256Hex(artifactBody ?? "{}");

  if (artifactBody !== null) {
    await env.PUBLICATION_BUCKET.put(artifactKey, artifactBody);
  }

  await env.PUBLICATION_BUCKET.put(
    publicationAliasKey(publicIdentifier),
    JSON.stringify({
      aliasVersion: 1,
      publicationId,
      artifactKey,
      artifactSha256,
    }),
  );
}

describe("public guest viewer", () => {
  it("serves a locally published Garden Promise artifact without creator or database access", async () => {
    const token = "10000000000000000000000000000001";
    const publicationId = "a0000000-0000-4000-8000-000000000001";
    const written = await publish(token, publicationId);
    expect(() => renderPublicationHtml(written.artifact)).not.toThrow();
    const response = await fetchViewer(`/i/mara-and-joaquin-${token}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Mara &amp; Joaquin");
    expect(html).toContain("Tap the invitation card to open");
    expect(html).toContain("Use your personalized invitation link to respond");
    expect(html).toContain('data-render-mode="published"');
    expect(html).toContain('id="publication-artifact"');
    expect(response.headers.get("content-language")).toBe("en-PH");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");

    const storedArtifact = await env.PUBLICATION_BUCKET.get(written.alias.artifactKey);
    if (!storedArtifact) {
      throw new Error("Expected the immutable artifact to exist");
    }
    expect(parsePublicationArtifact(JSON.parse(await storedArtifact.text()))).toEqual(
      written.artifact,
    );
  });

  it("supports HEAD while rejecting unsupported methods without reading private details", async () => {
    const token = "20000000000000000000000000000002";
    await publish(token, "a0000000-0000-4000-8000-000000000002");

    const head = await fetchViewer(`/i/garden-promise-${token}`, { method: "HEAD" });
    const post = await fetchViewer(`/i/garden-promise-${token}`, { method: "POST" });

    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
    expect(await post.text()).toContain("This invitation is unavailable.");
  });

  it("returns the same generic unavailable state for malformed, inactive, and missing links", async () => {
    const missingToken = "30000000000000000000000000000003";
    const malformed = await fetchViewer("/i/not-a-valid-invitation");
    const missing = await fetchViewer(`/i/quiet-garden-${missingToken}`);
    const malformedBody = await malformed.text();
    const missingBody = await missing.text();

    expect(malformed.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(malformedBody).toBe(missingBody);
    expect(missingBody).not.toContain(missingToken);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
  });

  it("fails closed for malformed aliases, missing artifacts, and invalid artifacts", async () => {
    const malformedAliasToken = "40000000000000000000000000000004";
    const missingArtifactToken = "50000000000000000000000000000005";
    const invalidArtifactToken = "60000000000000000000000000000006";

    await env.PUBLICATION_BUCKET.put(publicationAliasKey(malformedAliasToken), "{");
    await putAlias(missingArtifactToken, "a0000000-0000-4000-8000-000000000005", null);
    await putAlias(invalidArtifactToken, "a0000000-0000-4000-8000-000000000006", "{}");

    for (const token of [malformedAliasToken, missingArtifactToken, invalidArtifactToken]) {
      const response = await fetchViewer(`/i/garden-promise-${token}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("This invitation is unavailable.");
    }
  });

  it("rejects incompatible and unknown renderer pins before rendering", async () => {
    const incompatibleToken = "70000000000000000000000000000007";
    const unknownToken = "80000000000000000000000000000008";
    const incompatiblePublicationId = "a0000000-0000-4000-8000-000000000007";
    const unknownPublicationId = "a0000000-0000-4000-8000-000000000008";

    await publish(incompatibleToken, incompatiblePublicationId, snapshot("Mara & Joaquin", 99));

    await publish(unknownToken, unknownPublicationId, {
      ...snapshot(),
      rendererKey: "unknown-renderer",
    });

    for (const token of [incompatibleToken, unknownToken]) {
      const response = await fetchViewer(`/i/garden-promise-${token}`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("Mara &amp; Joaquin");
    }
  });

  it("fails closed for unsupported artifact and invitation schema versions", async () => {
    const artifactVersionToken = "b000000000000000000000000000000b";
    const schemaVersionToken = "c000000000000000000000000000000c";
    const artifactPublicationId = "a0000000-0000-4000-8000-000000000012";
    const schemaPublicationId = "a0000000-0000-4000-8000-000000000013";
    const currentArtifact = (
      await publish("d000000000000000000000000000000d", "a0000000-0000-4000-8000-000000000014")
    ).artifact;

    await putAlias(
      artifactVersionToken,
      artifactPublicationId,
      JSON.stringify({
        ...currentArtifact,
        artifactVersion: 2,
        publicationId: artifactPublicationId,
      }),
    );
    await putAlias(
      schemaVersionToken,
      schemaPublicationId,
      JSON.stringify({
        ...currentArtifact,
        publicationId: schemaPublicationId,
        snapshot: {
          ...currentArtifact.snapshot,
          invitationSchemaVersion: 2,
        },
      }),
    );

    for (const token of [artifactVersionToken, schemaVersionToken]) {
      const response = await fetchViewer(`/i/garden-promise-${token}`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("Mara &amp; Joaquin");
    }
  });

  it("keeps the prior alias readable when a later alias replacement fails", async () => {
    const token = "90000000000000000000000000000009";
    const firstPublicationId = "a0000000-0000-4000-8000-000000000009";
    const nextPublicationId = "a0000000-0000-4000-8000-000000000010";
    await publish(token, firstPublicationId, snapshot("Mara & Joaquin"));
    const workingStore = createWorkerPublicationObjectStore(env.PUBLICATION_BUCKET);

    const failingAliasStore: PublicationObjectStore = {
      get: (key) => workingStore.get(key),
      put: (key, value, options) => {
        if (key === publicationAliasKey(token)) {
          throw new Error("fictional alias write failure");
        }

        return workingStore.put(key, value, options);
      },
    };

    await expect(
      writePublicationArtifacts(failingAliasStore, {
        publicIdentifier: token,
        publicationId: nextPublicationId,
        snapshot: snapshot("Lira & Mateo"),
      }),
    ).rejects.toThrow("fictional alias write failure");

    const storedAlias = await env.PUBLICATION_BUCKET.get(publicationAliasKey(token));
    if (!storedAlias) {
      throw new Error("Expected the previous alias to remain");
    }
    const alias = parsePublicationAlias(JSON.parse(await storedAlias.text()));
    const response = await fetchViewer(`/i/any-decorative-label-${token}`);
    const html = await response.text();

    expect(alias.publicationId).toBe(firstPublicationId);
    expect(html).toContain("Mara &amp; Joaquin");
    expect(html).not.toContain("Lira &amp; Mateo");
  });

  it("never overwrites an immutable publication ID with different content", async () => {
    const token = "a000000000000000000000000000000a";
    const publicationId = "a0000000-0000-4000-8000-000000000011";
    await publish(token, publicationId, snapshot("Mara & Joaquin"));

    await expect(
      publish(token, publicationId, snapshot("Changed after publication")),
    ).rejects.toBeInstanceOf(PublicationArtifactConflictError);

    const artifact = await env.PUBLICATION_BUCKET.get(publicationArtifactKey(publicationId));
    if (!artifact) {
      throw new Error("Expected the immutable artifact to remain");
    }
    const artifactBody = await artifact.text();
    expect(artifactBody).toContain("Mara & Joaquin");
    expect(artifactBody).not.toContain("Changed after publication");

    const response = await fetchViewer(`/i/garden-promise-${token}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("Mara &amp; Joaquin");
    expect(html).not.toContain("Changed after publication");
  });
});

const littleBlessings = resolveTemplateById("little-blessings");
const littleBlessingsRenderer = resolveTemplateRendererRegistration(littleBlessings.rendererKey);

function littleBlessingsSnapshot(): PublicationSnapshot {
  return {
    snapshotVersion: 1,
    invitationSchemaVersion: 1,
    rendererKey: littleBlessings.rendererKey,
    rendererVersion: littleBlessingsRenderer.version,
    templateVersionId: littleBlessings.templateVersionId,
    templateVersion: littleBlessings.version,
    draftRevision: 3,
    document: littleBlessings.defaultDocument,
    assets: littleBlessings.defaultDocument.assets.map((asset, index) => {
      const digest = index.toString(16).padStart(64, "0");
      return {
        id: asset.id,
        kind: "image",
        contentType: "image/webp",
        width: 1600,
        height: 1200,
        renditions: [
          {
            width: 320,
            height: 240,
            objectKey: publicationMediaObjectKey(digest, 320),
            byteLength: 12_000,
            sha256: digest,
          },
          {
            width: 640,
            height: 480,
            objectKey: publicationMediaObjectKey(digest, 640),
            byteLength: 24_000,
            sha256: digest,
          },
        ],
      };
    }),
  };
}

describe("publication media route", () => {
  const mediaSha = "e".repeat(64);
  const mediaKey = publicationMediaObjectKey(mediaSha, 320);

  it("streams an immutable content-addressed rendition with hardened image headers", async () => {
    await env.PUBLICATION_BUCKET.put(mediaKey, new Uint8Array([1, 2, 3, 4]), {
      httpMetadata: { contentType: "image/webp" },
    });

    const response = await fetchViewer(`/m/v1/${mediaSha}/w320.webp`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));

    const head = await fetchViewer(`/m/v1/${mediaSha}/w320.webp`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  it("returns a bodyless 404 for a rendition that is not stored", async () => {
    const response = await fetchViewer(`/m/v1/${"f".repeat(64)}/w640.webp`);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects unsupported methods and out-of-contract media paths", async () => {
    const post = await fetchViewer(`/m/v1/${mediaSha}/w320.webp`, { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");

    const badWidth = await fetchViewer(`/m/v1/${mediaSha}/w500.webp`);
    expect(badWidth.status).toBe(404);
    expect(await badWidth.text()).toContain("This invitation is unavailable.");
  });
});

describe("Little Blessings publications", () => {
  it("serves a little-blessings-v1 christening publication with resolved responsive images", async () => {
    const token = "e100000000000000000000000000001e";
    const publicationId = "a0000000-0000-4000-8000-000000000020";
    const written = await publish(token, publicationId, littleBlessingsSnapshot());
    expect(() => renderPublicationHtml(written.artifact)).not.toThrow();

    const response = await fetchViewer(`/i/eliana-christening-${token}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Eliana Grace");
    expect(html).toContain("<img");
    expect(html).toContain("/m/v1/");
    expect(html).toContain('width="1600"');
    // Author-provided gallery alt text survives into the delivered markup.
    expect(html).toContain("Eliana resting in a light blanket");
    // No placeholder remains once every referenced asset resolves.
    expect(html).not.toContain("pending creator upload");
  });
});
