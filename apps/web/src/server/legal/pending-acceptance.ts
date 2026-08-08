import { createHmac, timingSafeEqual } from "node:crypto";

import type { LegalDocumentSet } from "@invitica/renderer/legal-documents";

const tokenVersion = 1;
export const pendingAcceptanceMaxAgeSeconds = 24 * 60 * 60;

interface PendingAcceptancePayload {
  issuedAt: number;
  privacyNoticeVersion: string;
  termsVersion: string;
  version: number;
}

function decodeSecret(value = process.env.LEGAL_ACCEPTANCE_COOKIE_SECRET): Buffer {
  if (!value) {
    throw new Error("LEGAL_ACCEPTANCE_COOKIE_SECRET must be a 32-byte base64url secret.");
  }

  const secret = Buffer.from(value, "base64url");
  if (secret.length !== 32) {
    throw new Error("LEGAL_ACCEPTANCE_COOKIE_SECRET must decode to exactly 32 bytes.");
  }

  return secret;
}

export function legalAcceptanceCookieSecretIsConfigured(
  value = process.env.LEGAL_ACCEPTANCE_COOKIE_SECRET,
): boolean {
  try {
    decodeSecret(value);
    return true;
  } catch {
    return false;
  }
}

function signatureFor(encodedPayload: string, secret: Buffer): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function createPendingAcceptanceToken(
  documents: LegalDocumentSet,
  options: { now?: number; secret?: string } = {},
): string {
  const payload: PendingAcceptancePayload = {
    issuedAt: options.now ?? Date.now(),
    privacyNoticeVersion: documents.privacy.version,
    termsVersion: documents.terms.version,
    version: tokenVersion,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signatureFor(encodedPayload, decodeSecret(options.secret)).toString(
    "base64url",
  );

  return `${encodedPayload}.${signature}`;
}

export function verifyPendingAcceptanceToken(
  token: string,
  documents: LegalDocumentSet,
  options: { now?: number; secret?: string } = {},
): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }
  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) {
    return false;
  }

  let expectedSignature: Buffer;
  try {
    expectedSignature = signatureFor(encodedPayload, decodeSecret(options.secret));
  } catch {
    return false;
  }
  const providedSignature = Buffer.from(encodedSignature, "base64url");
  if (
    expectedSignature.length !== providedSignature.length ||
    !timingSafeEqual(expectedSignature, providedSignature)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<PendingAcceptancePayload>;
    if (typeof payload.issuedAt !== "number") {
      return false;
    }
    const now = options.now ?? Date.now();
    const age = now - payload.issuedAt;

    return (
      payload.version === tokenVersion &&
      payload.termsVersion === documents.terms.version &&
      payload.privacyNoticeVersion === documents.privacy.version &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= pendingAcceptanceMaxAgeSeconds * 1_000
    );
  } catch {
    return false;
  }
}
