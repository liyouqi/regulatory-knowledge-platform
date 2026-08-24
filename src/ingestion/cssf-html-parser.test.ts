import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseCssfHtml } from "./cssf-html-parser";
import type { CssfSourceSnapshot } from "./cssf-snapshot";
import type { CssfSourceDefinition } from "./cssf-source-registry";

const html = `<!doctype html>
<html><body><main><div class="main-content"><div class="content-section">
<h1 class="single-news__title">Reviewed CSSF communication</h1>
<div class="text_content"><p>Official introduction<sup>1</sup>&nbsp;with detail.</p></div>
<div class="text-heading"><h2 id="section-one" data-intoc>1. First official section</h2></div>
<div class="text_content">
  <p>Section paragraph &amp; detail.</p>
  <ol><li>First requirement<ul><li>Nested condition</li></ul></li></ol>
  <p><img src="https://www.cssf.lu/wp-content/uploads/diagram.jpg" alt=""></p>
</div>
<ul class="files-links-table"><li>Related document metadata</li></ul>
<div class="footnotes"><p><sup>1</sup> Official footnote.</p></div>
</div></div></main></body></html>`;

const bytes = new TextEncoder().encode(html);
const hash = createHash("sha256").update(bytes).digest("hex");
const source: CssfSourceDefinition = {
  localId: "communication-test",
  familyId: "family:cssf",
  authority: "CSSF",
  jurisdiction: "LU",
  shortName: "CSSF Test",
  officialTitle: "Reviewed CSSF communication",
  aliases: ["CSSF fixture"],
  language: "en",
  documentType: "communication",
  regulatoryLevel: "level-3",
  measureType: "other",
  publicationDate: "2025-04-09",
  checkedAt: "2026-08-24T00:00:00.000Z",
  pageUrl: "https://www.cssf.lu/en/test/",
  contentUrl: "https://www.cssf.lu/en/test/",
  contentMediaType: "text/html",
  topics: ["ICT"],
};
const snapshot: CssfSourceSnapshot = {
  schemaVersion: "1.0.0",
  snapshotId: `snapshot:cssf:communication-test:${hash}`,
  provenance: "official",
  sourceSystem: "cssf",
  documentId: "lu:cssf:communication-test",
  localId: "communication-test",
  language: "en",
  retrievedAt: "2026-08-24T00:00:00.000Z",
  canonicalUrl: source.pageUrl,
  page: {
    url: source.pageUrl,
    mediaType: "text/html",
    etag: null,
    lastModified: null,
    sha256: `sha256:${hash}`,
    bytes: bytes.byteLength,
    file: "page.html",
  },
  content: {
    url: source.contentUrl,
    mediaType: "text/html",
    etag: null,
    lastModified: null,
    sha256: `sha256:${hash}`,
    bytes: bytes.byteLength,
    file: "source.html",
  },
};

describe("CSSF HTML structural adapter", () => {
  it("preserves official headings, paragraphs, nested lists, and footnotes", () => {
    const result = parseCssfHtml(html, snapshot, source);
    const introduction = result.document.provisions.find((provision) =>
      provision.logicalId.endsWith(":provision:introduction"),
    );
    const section = result.document.provisions.find((provision) =>
      provision.logicalId.endsWith(":provision:section-1"),
    );

    expect(result.report).toEqual({
      sectionCount: 2,
      blockCount: 5,
      warningCount: 2,
    });
    expect(result.document).toMatchObject({
      logicalId: "lu:cssf:communication-test",
      jurisdiction: "LU",
      documentType: "other",
      identifiers: { localId: "communication-test" },
      officialTitle: "Reviewed CSSF communication",
    });
    expect(introduction?.text).toBe("Official introduction1 with detail.");
    expect(section).toMatchObject({
      label: "Section 1",
      title: "1. First official section",
    });
    expect(section?.text).toBe(
      [
        "Section paragraph & detail.",
        "First requirement\nNested condition",
        "1 Official footnote.",
      ].join("\n"),
    );
    expect(result.document.parserWarnings).toEqual([
      "Unsupported substantive image in CSSF HTML: https://www.cssf.lu/wp-content/uploads/diagram.jpg",
      "Excluded 1 CSSF related-document collections from official body text",
    ]);
  });

  it("rejects title drift and content not covered by the snapshot hash", () => {
    expect(() =>
      parseCssfHtml(
        html.replace("Reviewed CSSF communication", "Changed heading"),
        snapshot,
        source,
      ),
    ).toThrow("CSSF HTML input does not match snapshot content hash");
    expect(() =>
      parseCssfHtml(html, snapshot, {
        ...source,
        officialTitle: "Different registered title",
      }),
    ).toThrow("CSSF official title mismatch");
  });

  it("rejects structural drift from a reviewed quality baseline", () => {
    expect(() =>
      parseCssfHtml(html, snapshot, {
        ...source,
        quality: {
          sectionCount: 3,
          blockCount: 5,
          maximumWarnings: 2,
          textHashes: {},
        },
      }),
    ).toThrow("CSSF section count drift");
  });
});
