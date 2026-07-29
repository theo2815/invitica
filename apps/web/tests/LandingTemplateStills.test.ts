import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const templateIds = ["garden-promise", "golden-hour", "sunday-joy", "little-blessings"] as const;

describe("landing template stills", () => {
  it("keeps one distinct, mobile-sized JPEG for every public template", async () => {
    const hashes = new Set<string>();

    for (const templateId of templateIds) {
      const bytes = await readFile(
        join(process.cwd(), "public", "landing", "templates", `${templateId}.jpg`),
      );
      const metadata = await sharp(bytes).metadata();

      expect(metadata.format).toBe("jpeg");
      expect(metadata.width).toBe(720);
      expect(metadata.height).toBe(1280);
      expect(bytes.byteLength).toBeGreaterThan(20_000);
      expect(bytes.byteLength).toBeLessThan(150_000);
      hashes.add(createHash("sha256").update(bytes).digest("hex"));
    }

    expect(hashes.size).toBe(templateIds.length);
  });
});
