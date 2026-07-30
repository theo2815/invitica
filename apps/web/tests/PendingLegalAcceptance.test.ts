import type { LegalDocumentSet } from "@invitica/renderer/legal-documents";
import { describe, expect, it } from "vitest";

import {
  createPendingAcceptanceToken,
  legalAcceptanceCookieSecretIsConfigured,
  pendingAcceptanceMaxAgeSeconds,
  verifyPendingAcceptanceToken,
} from "../src/server/legal/pending-acceptance";

const secret = Buffer.alloc(32, 7).toString("base64url");
const documents = {
  privacy: {
    effectiveDate: "2026-08-01",
    kind: "privacy",
    path: "/privacy",
    publicUrl: "https://invitica.app/privacy",
    status: "effective",
    title: "Privacy Notice",
    version: "2026-08-01",
  },
  terms: {
    effectiveDate: "2026-08-01",
    kind: "terms",
    path: "/terms",
    publicUrl: "https://invitica.app/terms",
    status: "effective",
    title: "Terms of Service",
    version: "2026-08-01",
  },
} satisfies LegalDocumentSet;

describe("pending email-registration acceptance", () => {
  it("accepts an untampered current-version token inside its lifetime", () => {
    const issuedAt = Date.UTC(2026, 6, 29, 12);
    const token = createPendingAcceptanceToken(documents, { now: issuedAt, secret });

    expect(
      verifyPendingAcceptanceToken(token, documents, {
        now: issuedAt + pendingAcceptanceMaxAgeSeconds * 500,
        secret,
      }),
    ).toBe(true);
  });

  it("rejects tampering, expiry, and a different presented document version", () => {
    const issuedAt = Date.UTC(2026, 6, 29, 12);
    const token = createPendingAcceptanceToken(documents, { now: issuedAt, secret });
    const [payload, signature] = token.split(".");
    const changedDocuments: LegalDocumentSet = {
      ...documents,
      terms: { ...documents.terms, version: "2026-09-01" },
    };

    expect(
      verifyPendingAcceptanceToken(`${payload}x.${signature}`, documents, {
        now: issuedAt,
        secret,
      }),
    ).toBe(false);
    expect(
      verifyPendingAcceptanceToken(`${token}..ignored`, documents, {
        now: issuedAt,
        secret,
      }),
    ).toBe(false);
    expect(
      verifyPendingAcceptanceToken(token, documents, {
        now: issuedAt + pendingAcceptanceMaxAgeSeconds * 1_000 + 1,
        secret,
      }),
    ).toBe(false);
    expect(
      verifyPendingAcceptanceToken(token, changedDocuments, {
        now: issuedAt,
        secret,
      }),
    ).toBe(false);
  });

  it("requires a distinct 32-byte signing secret", () => {
    expect(legalAcceptanceCookieSecretIsConfigured(secret)).toBe(true);
    expect(legalAcceptanceCookieSecretIsConfigured("too-short")).toBe(false);
    expect(legalAcceptanceCookieSecretIsConfigured(undefined)).toBe(false);
    expect(
      verifyPendingAcceptanceToken("payload.signature", documents, { secret: "too-short" }),
    ).toBe(false);
  });
});
