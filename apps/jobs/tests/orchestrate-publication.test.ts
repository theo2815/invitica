import {
  type PublicationObjectStore,
  type PublicationObjectWriteOptions,
  parsePublicationAlias,
  parsePublicationSnapshot,
  publicationAliasKey,
  publicationArtifactKey,
  type StoredPublicationObject,
} from "@invitica/invitation-schema";
import { invitationFixture } from "@invitica/invitation-schema/testing";
import { describe, expect, it } from "vitest";

import {
  orchestratePublication,
  type PublicationJobLogger,
  type PublicationJobRecord,
  type PublicationJobRepository,
} from "../src/orchestrate-publication.js";

const publicationId = "92000000-0000-4000-8000-000000000001";
const previousId = "92000000-0000-4000-8000-000000000002";
const publicIdentifier = "0123456789abcdef0123456789abcdef";
const snapshot = parsePublicationSnapshot({
  snapshotVersion: 1,
  invitationSchemaVersion: 1,
  rendererKey: "garden-promise-v1",
  rendererVersion: 1,
  templateVersionId: invitationFixture.templateVersionId,
  templateVersion: 1,
  draftRevision: 4,
  document: invitationFixture,
  assets: [],
});

class MemoryStore implements PublicationObjectStore {
  readonly objects = new Map<string, StoredPublicationObject>();
  failAliasWrites = false;
  #version = 0;

  async get(key: string) {
    return this.objects.get(key) ?? null;
  }

  async put(key: string, body: string, options: PublicationObjectWriteOptions) {
    if (this.failAliasWrites && key.startsWith("publication-aliases/")) {
      throw new Error("private provider detail");
    }
    const current = this.objects.get(key);
    if (options.onlyIfAbsent && current) return { version: current.version, written: false };
    if (options.ifMatch && current?.version !== options.ifMatch) {
      return { version: current?.version ?? null, written: false };
    }
    const version = `etag-${++this.#version}`;
    this.objects.set(key, {
      body,
      size: new TextEncoder().encode(body).byteLength,
      version,
    });
    return { version, written: true };
  }

  async deleteIfVersion(key: string, version: string) {
    if (this.objects.get(key)?.version !== version) return false;
    this.objects.delete(key);
    return true;
  }
}

class MemoryRepository implements PublicationJobRepository {
  readonly record: PublicationJobRecord;
  readonly transitions: string[] = [];
  selectResult = true;
  confirmResult = true;

  constructor(overrides: Partial<PublicationJobRecord> = {}) {
    this.record = {
      id: publicationId,
      snapshot,
      publicIdentifier,
      activePublicationId: null,
      deliveredPublicationId: null,
      deliveredArtifactKey: null,
      deliveredArtifactSha256: null,
      ...overrides,
    };
  }

  async loadPublication() {
    this.transitions.push("load");
    return this.record;
  }
  async startBuild() {
    this.transitions.push("start");
  }
  async completeBuild() {
    this.transitions.push("complete");
  }
  async failBuild(_id: string, code: string) {
    this.transitions.push(`fail:${code}`);
  }
  async selectDelivery() {
    this.transitions.push("select");
    return this.selectResult;
  }
  async confirmDelivery() {
    this.transitions.push("confirm");
    return this.confirmResult;
  }
  async recordDeliveryFailure(_id: string, code: string, terminal: boolean) {
    this.transitions.push(`delivery-fail:${code}:${String(terminal)}`);
    return true;
  }
}

function createLogger(): PublicationJobLogger & { entries: string[] } {
  const entries: string[] = [];
  return {
    entries,
    info(message, attributes) {
      entries.push(JSON.stringify({ attributes, message }));
    },
    error(message, attributes) {
      entries.push(JSON.stringify({ attributes, message }));
    },
  };
}

const attempt = { attemptNumber: 1, maxAttempts: 4 } as const;

describe("publication orchestration", () => {
  it("delivers once and safely resumes the immutable artifact", async () => {
    const repository = new MemoryRepository();
    const store = new MemoryStore();

    await expect(
      orchestratePublication(repository, store, createLogger(), publicationId, attempt),
    ).resolves.toEqual({ publicationId, status: "delivered" });
    const firstArtifactVersion = store.objects.get(publicationArtifactKey(publicationId))?.version;
    await orchestratePublication(repository, store, createLogger(), publicationId, attempt);

    expect(store.objects.get(publicationArtifactKey(publicationId))?.version).toBe(
      firstArtifactVersion,
    );
    const alias = store.objects.get(publicationAliasKey(publicIdentifier));
    expect(parsePublicationAlias(JSON.parse(alias?.body ?? ""))).toMatchObject({ publicationId });
  });

  it("stops an immutable conflict before delivery and records it terminal", async () => {
    const repository = new MemoryRepository();
    const store = new MemoryStore();
    store.objects.set(publicationArtifactKey(publicationId), {
      body: "{}",
      size: 2,
      version: "existing",
    });

    await expect(
      orchestratePublication(repository, store, createLogger(), publicationId, attempt),
    ).rejects.toThrow("different content");
    expect(repository.transitions).toContain("fail:artifact_conflict");
    expect(repository.transitions).not.toContain("select");
  });

  it("records retryable alias failure without logging content or provider details", async () => {
    const repository = new MemoryRepository();
    const store = new MemoryStore();
    const logger = createLogger();
    store.failAliasWrites = true;

    await expect(
      orchestratePublication(repository, store, logger, publicationId, attempt),
    ).rejects.toThrow("private provider detail");
    expect(repository.transitions).toContain("delivery-fail:publication_job_failed:false");
    const output = logger.entries.join("\\n");
    expect(output).not.toContain("Theo & Maria");
    expect(output).not.toContain("private provider detail");
    expect(output).not.toContain(publicIdentifier);
  });

  it("skips stale delivery selection without replacing the alias", async () => {
    const repository = new MemoryRepository();
    repository.selectResult = false;
    const store = new MemoryStore();

    await expect(
      orchestratePublication(repository, store, createLogger(), publicationId, attempt),
    ).resolves.toEqual({ publicationId, status: "stale" });
    expect(store.objects.has(publicationAliasKey(publicIdentifier))).toBe(false);
  });

  it("restores the delivered alias when confirmation is superseded", async () => {
    const oldKey = publicationArtifactKey(previousId);
    const oldSha = "a".repeat(64);
    const repository = new MemoryRepository({
      deliveredPublicationId: previousId,
      deliveredArtifactKey: oldKey,
      deliveredArtifactSha256: oldSha,
    });
    repository.confirmResult = false;
    const store = new MemoryStore();
    store.objects.set(publicationAliasKey(publicIdentifier), {
      body: JSON.stringify({
        aliasVersion: 1,
        publicationId: previousId,
        artifactKey: oldKey,
        artifactSha256: oldSha,
      }),
      size: 250,
      version: "previous",
    });

    await expect(
      orchestratePublication(repository, store, createLogger(), publicationId, attempt),
    ).resolves.toEqual({ publicationId, status: "stale" });
    const restored = store.objects.get(publicationAliasKey(publicIdentifier));
    expect(parsePublicationAlias(JSON.parse(restored?.body ?? ""))).toMatchObject({
      publicationId: previousId,
    });
  });

  it("removes an unconfirmed first alias without touching newer writes", async () => {
    const repository = new MemoryRepository();
    repository.confirmResult = false;
    const store = new MemoryStore();

    await expect(
      orchestratePublication(repository, store, createLogger(), publicationId, attempt),
    ).resolves.toEqual({ publicationId, status: "stale" });
    expect(store.objects.has(publicationAliasKey(publicIdentifier))).toBe(false);
  });
});
