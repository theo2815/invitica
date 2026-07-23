import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

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

function getGuestLinkEncryptionKey(): Buffer {
  const encoded = process.env.GUEST_LINK_ENCRYPTION_KEY;

  if (!encoded || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error("GUEST_LINK_ENCRYPTION_KEY must be a 32-byte base64url secret.");
  }

  const key = Buffer.from(encoded, "base64url");
  if (key.byteLength !== 32) {
    throw new Error("GUEST_LINK_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return key;
}

function getGuestLinkEncryptionKeyVersion(): number {
  const configured = process.env.GUEST_LINK_ENCRYPTION_KEY_VERSION ?? "1";
  const version = Number(configured);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("GUEST_LINK_ENCRYPTION_KEY_VERSION must be a positive integer.");
  }
  return version;
}

function guestLinkAssociatedData(linkId: string): Buffer {
  return Buffer.from(`invitica:guest-link:v1:${linkId}`, "utf8");
}

export interface EncryptedGuestLinkToken {
  readonly ciphertext: string;
  readonly keyVersion: number;
  readonly nonce: string;
}

export function generateGuestLinkToken(): string {
  return guestLinkTokenSchema.parse(randomBytes(32).toString("base64url"));
}

export function hashGuestLinkToken(token: string): string {
  const parsedToken = guestLinkTokenSchema.parse(token);
  return createHmac("sha256", getGuestLinkHashKey()).update(parsedToken, "utf8").digest("hex");
}

export function encryptGuestLinkToken(token: string, linkId: string): EncryptedGuestLinkToken {
  const parsedToken = guestLinkTokenSchema.parse(token);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getGuestLinkEncryptionKey(), nonce);
  cipher.setAAD(guestLinkAssociatedData(linkId));
  const encrypted = Buffer.concat([cipher.update(parsedToken, "utf8"), cipher.final()]);
  const ciphertext = Buffer.concat([encrypted, cipher.getAuthTag()]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    keyVersion: getGuestLinkEncryptionKeyVersion(),
    nonce: nonce.toString("base64url"),
  };
}

export function decryptGuestLinkToken(encrypted: EncryptedGuestLinkToken, linkId: string): string {
  if (encrypted.keyVersion !== getGuestLinkEncryptionKeyVersion()) {
    throw new Error("The guest-link encryption key version is unavailable.");
  }

  const nonce = Buffer.from(encrypted.nonce, "base64url");
  const combined = Buffer.from(encrypted.ciphertext, "base64url");
  if (nonce.byteLength !== 12 || combined.byteLength <= 16) {
    throw new Error("The encrypted guest-link token is malformed.");
  }

  const encryptedToken = combined.subarray(0, combined.byteLength - 16);
  const authenticationTag = combined.subarray(combined.byteLength - 16);
  const decipher = createDecipheriv("aes-256-gcm", getGuestLinkEncryptionKey(), nonce);
  decipher.setAAD(guestLinkAssociatedData(linkId));
  decipher.setAuthTag(authenticationTag);
  const token = Buffer.concat([decipher.update(encryptedToken), decipher.final()]).toString("utf8");
  return guestLinkTokenSchema.parse(token);
}
