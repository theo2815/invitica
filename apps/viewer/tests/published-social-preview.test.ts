import { publicationSocialPreviewObjectKey } from "@invitica/invitation-schema";
import { describe, expect, it } from "vitest";

import {
  parseSocialPreviewRequestPath,
  socialPreviewPublicPath,
} from "../src/published-social-preview";

describe("published social preview paths", () => {
  it("maps only fixed content-addressed JPEG paths into the public prefix", () => {
    const digest = "a".repeat(64);

    expect(parseSocialPreviewRequestPath(socialPreviewPublicPath(digest))).toEqual({
      objectKey: publicationSocialPreviewObjectKey(digest),
    });
    expect(parseSocialPreviewRequestPath(`/s/v1/${digest}.webp`)).toBeNull();
    expect(parseSocialPreviewRequestPath("/s/v1/../private.jpg")).toBeNull();
  });
});
