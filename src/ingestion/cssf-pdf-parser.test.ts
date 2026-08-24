import { describe, expect, it } from "vitest";
import { toDocumentView } from "../canonical/to-document-view";
import {
  type CssfPdfSemanticEvent,
  buildCssfCircularFromSemanticEvents,
} from "./cssf-pdf-parser";
import type { CssfSourceSnapshot } from "./cssf-snapshot";
import type { CssfSourceDefinition } from "./cssf-source-registry";

const source: CssfSourceDefinition = {
  localId: "circular-test",
  familyId: "family:cssf",
  authority: "CSSF",
  jurisdiction: "LU",
  shortName: "Circular CSSF Test",
  officialTitle: "Circular CSSF Test",
  subject: "Reviewed subject",
  aliases: ["CSSF test"],
  language: "en",
  documentType: "circular",
  regulatoryLevel: "level-3",
  measureType: "other",
  publicationDate: "2025-05-27",
  checkedAt: "2026-08-24T00:00:00.000Z",
  pageUrl: "https://www.cssf.lu/en/Document/test/",
  contentUrl: "https://www.cssf.lu/wp-content/uploads/test.pdf",
  contentMediaType: "application/pdf",
  topics: ["DORA"],
};
const hash = "a".repeat(64);
const snapshot: CssfSourceSnapshot = {
  schemaVersion: "1.0.0",
  snapshotId: `snapshot:cssf:circular-test:${hash}`,
  provenance: "official",
  sourceSystem: "cssf",
  documentId: "lu:cssf:circular-test",
  localId: "circular-test",
  language: "en",
  retrievedAt: "2026-08-24T00:00:00.000Z",
  canonicalUrl: source.pageUrl,
  page: {
    url: source.pageUrl,
    mediaType: "text/html",
    etag: null,
    lastModified: null,
    sha256: `sha256:${hash}`,
    bytes: 1,
    file: "page.html",
  },
  content: {
    url: source.contentUrl,
    mediaType: "application/pdf",
    etag: null,
    lastModified: null,
    sha256: `sha256:${hash}`,
    bytes: 1,
    file: "source.pdf",
  },
};

const events: CssfPdfSemanticEvent[] = [
  { page: 2, role: "paragraph", text: "Circular CSSF Test", depth: 0 },
  { page: 2, role: "paragraph", text: "Reviewed subject", depth: 0 },
  { page: 2, role: "paragraph", text: "Official introduction.", depth: 0 },
  { page: 2, role: "note", text: "1 Official footnote.", depth: 0 },
  { page: 3, role: "heading", text: "Chapter 1: Scope", depth: 0 },
  { page: 3, role: "list-item", text: "1. First requirement:", depth: 0 },
  { page: 3, role: "list-item", text: "a) First condition", depth: 0 },
  { page: 3, role: "list-item", text: "(1) Nested detail", depth: 1 },
  { page: 4, role: "list-item", text: "2. Second requirement", depth: 0 },
  { page: 4, role: "heading", text: "Chapter 2: Application", depth: 0 },
  { page: 4, role: "list-item", text: "3. Final requirement", depth: 0 },
  { page: 4, role: "table", text: "Signatures", depth: 0 },
];

describe("CSSF tagged-PDF structural adapter", () => {
  it("preserves chapters, contiguous numbered provisions, nested points, and notes", () => {
    const result = buildCssfCircularFromSemanticEvents(
      events,
      4,
      snapshot,
      source,
    );

    expect(result.report).toEqual({
      pageCount: 4,
      structuralNodeCount: 2,
      provisionCount: 4,
      pointCount: 4,
      warningCount: 1,
    });
    expect(result.document.structuralNodes).toEqual([
      expect.objectContaining({ label: "Chapter 1", title: "Scope" }),
      expect.objectContaining({ label: "Chapter 2", title: "Application" }),
    ]);
    expect(
      result.document.provisions.find((item) =>
        item.logicalId.endsWith(":provision:introduction"),
      )?.text,
    ).toBe("Official introduction.\n1 Official footnote.");
    expect(
      result.document.provisions.find((item) =>
        item.logicalId.endsWith(":provision:point-1"),
      ),
    ).toMatchObject({
      label: "Point 1",
      parentLogicalId: "lu:cssf:circular-test:chapter:1",
      text: "First requirement:\nFirst condition\nNested detail",
    });
    expect(result.document.parserWarnings).toEqual([
      "Excluded CSSF PDF table on page 4",
    ]);

    const view = toDocumentView(result.document, "cssf-pdf-test-build");
    expect(view.collections).toEqual([
      expect.objectContaining({
        id: "provisions",
        label: "Provisions",
        count: 4,
        roots: [
          expect.objectContaining({
            label: "Introduction",
            type: "provision",
          }),
          expect.objectContaining({
            label: "Chapter 1",
            title: "Scope",
            type: "group",
            children: [
              expect.objectContaining({
                label: "Point 1",
                type: "provision",
              }),
              expect.objectContaining({
                label: "Point 2",
                type: "provision",
              }),
            ],
          }),
          expect.objectContaining({
            label: "Chapter 2",
            title: "Application",
            type: "group",
            children: [
              expect.objectContaining({
                label: "Point 3",
                type: "provision",
              }),
            ],
          }),
        ],
      }),
    ]);
  });

  it("fails closed when numbered provisions are not contiguous", () => {
    expect(() =>
      buildCssfCircularFromSemanticEvents(
        events.filter((event) => !event.text.startsWith("2.")),
        4,
        snapshot,
        source,
      ),
    ).toThrow("CSSF PDF numbered provisions are not contiguous");
  });
});
