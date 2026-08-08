import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LegalDocumentMetadata } from "../src/legal-documents.js";
import { PoweredByInvitica, PrivacyNoticeLink } from "../src/PoweredByInvitica.js";

const draftPrivacyNotice = {
  effectiveDate: null,
  kind: "privacy",
  path: "/privacy",
  publicUrl: "https://invitica.app/privacy",
  status: "draft",
  title: "Privacy Notice",
  version: "draft-2026-07-29",
} satisfies LegalDocumentMetadata;

describe("guest legal-document access", () => {
  it("carries the effective Privacy notice into published invitation footers", () => {
    const html = renderToStaticMarkup(<PoweredByInvitica />);

    expect(html).toContain("Powered by");
    expect(html).toContain('href="https://invitica.app/"');
    expect(html).toContain('aria-label="Invitica home (opens in a new tab)"');
    expect(html).toContain('href="https://invitica.app/privacy"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('referrerPolicy="no-referrer"');
  });

  it("shows an effective Privacy notice without disclosing the invitation referrer", () => {
    const html = renderToStaticMarkup(<PrivacyNoticeLink />);

    expect(html).toContain('href="https://invitica.app/privacy"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain("Privacy");
  });

  it("still withholds the link when a document is not effective", () => {
    expect(renderToStaticMarkup(<PrivacyNoticeLink document={draftPrivacyNotice} />)).toBe("");
    expect(
      renderToStaticMarkup(
        <PrivacyNoticeLink document={{ ...draftPrivacyNotice, status: "effective" }} />,
      ),
    ).toBe("");
  });
});
