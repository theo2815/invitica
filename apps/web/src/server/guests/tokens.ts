import { createHmac, randomBytes } from "node:crypto";

import { guestLinkTokenSchema } from "@invitica/invitation-schema";

function getGuestLinkHashKey(): Buffer {
  const encoded = process.env.GUEST_LINK_HASH_KEY;

  if (!encoded || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error("GUEST_LINK_HASH_KEY must be a 32-byte base64url secret.");
  }

  const key = Buffer.from(encoded, "base64url");
  if (key.byteLength !== 32) {
    throw new Error("GUEST_LINK_HASH_KEY must decode to exactly 32 bytes.");
  }

  return key;
}

export function generateGuestLinkToken(): string {
  return guestLinkTokenSchema.parse(randomBytes(32).toString("base64url"));
}

export function hashGuestLinkToken(token: string): string {
  const parsedToken = guestLinkTokenSchema.parse(token);
  return createHmac("sha256", getGuestLinkHashKey()).update(parsedToken, "utf8").digest("hex");
}
