import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LegalDocumentMetadata } from "../src/legal-documents.js";
import { PoweredByInvitica, PrivacyNoticeLink } from "../src/PoweredByInvitica.js";

const effectivePrivacyNotice = {
  effectiveDate: "2026-08-01",
  kind: "privacy",
  path: "/privacy",
  publicUrl: "https://invitica.app/privacy",
  status: "effective",
  title: "Privacy Notice",
  version: "2026-08-01",
} satisfies LegalDocumentMetadata;

describe("guest legal-document access", () => {
  it("keeps draft legal documents out of published invitation footers", () => {
    const html = renderToStaticMarkup(<PoweredByInvitica />);

    expect(html).toContain("Powered by");
    expect(html).not.toContain("Privacy");
    expect(html).toContain('href="https://invitica.app/"');
    expect(html).toContain('aria-label="Invitica home (opens in a new tab)"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('referrerPolicy="no-referrer"');
  });

  it("shows an effective Privacy notice without disclosing the invitation referrer", () => {
    const html = renderToStaticMarkup(<PrivacyNoticeLink document={effectivePrivacyNotice} />);

    expect(html).toContain('href="https://invitica.app/privacy"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain("Privacy");
  });
});
