import type { PublicationSnapshot } from "@invitica/invitation-schema";
import { describe, expect, it } from "vitest";

import {
  createSnapshotImageResolver,
  mediaPublicPath,
  parseMediaRequestPath,
} from "../src/published-media";

const sha = "a".repeat(64);

describe("published media paths", () => {
  it("maps a rendition to its immutable same-origin path and storage key", () => {
    expect(mediaPublicPath(sha, 320)).toBe(`/m/v1/${sha}/w320.webp`);
    expect(parseMediaRequestPath(`/m/v1/${sha}/w320.webp`)).toEqual({
      objectKey: `publication-media/v1/${sha}/w320.webp`,
    });
    expect(parseMediaRequestPath(`/m/v1/${sha}/w1280.webp`)).toEqual({
      objectKey: `publication-media/v1/${sha}/w1280.webp`,
    });
  });

  it("rejects digests, widths, and shapes that fall outside the media contract", () => {
    expect(parseMediaRequestPath(`/m/v1/${sha}/w500.webp`)).toBeNull(); // not an allowlisted width
    expect(parseMediaRequestPath(`/m/v1/${sha}/w200.webp`)).toBeNull(); // min dimension, not a rendition
    expect(parseMediaRequestPath(`/m/v1/${"A".repeat(64)}/w320.webp`)).toBeNull(); // uppercase hex
    expect(parseMediaRequestPath(`/m/v1/${"a".repeat(63)}/w320.webp`)).toBeNull(); // short digest
    expect(parseMediaRequestPath(`/m/v1/${sha}/w320.png`)).toBeNull(); // wrong extension
    expect(parseMediaRequestPath(`/m/v2/${sha}/w320.webp`)).toBeNull(); // wrong version prefix
    expect(parseMediaRequestPath(`/media/originals/v1/${sha}.jpg`)).toBeNull(); // never serves originals
    expect(parseMediaRequestPath(`/m/v1/${sha}/../w320.webp`)).toBeNull(); // traversal
    expect(parseMediaRequestPath(`/i/some-invitation-${sha.slice(0, 32)}`)).toBeNull();
  });
});

describe("snapshot image resolver", () => {
  const assets: PublicationSnapshot["assets"] = [
    {
      contentType: "image/webp",
      height: 1200,
      id: "45000000-0000-4000-8000-000000000001",
      kind: "image",
      renditions: [
        {
          byteLength: 12_000,
          height: 240,
          objectKey: `publication-media/v1/${sha}/w320.webp`,
          sha256: sha,
          width: 320,
        },
        {
          byteLength: 24_000,
          height: 480,
          objectKey: `publication-media/v1/${sha}/w640.webp`,
          sha256: sha,
          width: 640,
        },
      ],
      width: 1600,
    },
  ];

  it("builds viewer-safe responsive image data from the snapshot manifest", () => {
    const resolve = createSnapshotImageResolver(assets);

    expect(resolve("45000000-0000-4000-8000-000000000001")).toEqual({
      height: 1200,
      renditions: [
        { height: 240, url: `/m/v1/${sha}/w320.webp`, width: 320 },
        { height: 480, url: `/m/v1/${sha}/w640.webp`, width: 640 },
      ],
      width: 1600,
    });
  });

  it("returns null for assets with no ready media in the snapshot", () => {
    const resolve = createSnapshotImageResolver(assets);
    expect(resolve("45000000-0000-4000-8000-000000000099")).toBeNull();
    expect(createSnapshotImageResolver([])("45000000-0000-4000-8000-000000000001")).toBeNull();
  });
});
