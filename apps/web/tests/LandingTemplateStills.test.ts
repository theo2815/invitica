import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { templateCatalog } from "@invitica/template-kit";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { templateStillSource } from "../src/components/templates/template-stills";

describe("landing template stills", () => {
  it("returns no image for an unregistered template", () => {
    expect(templateStillSource("unregistered-template")).toBeNull();
  });

  it("keeps one distinct, mobile-sized JPEG for every public template", async () => {
    const hashes = new Set<string>();

    for (const template of templateCatalog) {
      const source = templateStillSource(template.id);
      expect(source).not.toBeNull();
      expect(source).toBe(`/landing/templates/${template.id}-svg-20260804.jpg`);

      const bytes = await readFile(
        join(process.cwd(), "public", source?.replace(/^\//, "") ?? "missing-template-still"),
      );
      const metadata = await sharp(bytes).metadata();

      expect(metadata.format).toBe("jpeg");
      expect(metadata.width).toBe(720);
      expect(metadata.height).toBe(1280);
      expect(bytes.byteLength).toBeGreaterThan(20_000);
      expect(bytes.byteLength).toBeLessThan(150_000);
      hashes.add(createHash("sha256").update(bytes).digest("hex"));
    }

    expect(hashes.size).toBe(templateCatalog.length);
  });
});
