import { describe, expect, it } from "vitest";
import { toDocumentView } from "../canonical/to-document-view";
import { buildCssfConsolidatedCircularFromSemanticEvents } from "./cssf-consolidated-pdf-parser";
import type { CssfPdfSemanticEvent } from "./cssf-pdf-parser";
import type { CssfSourceSnapshot } from "./cssf-snapshot";
import type { CssfSourceDefinition } from "./cssf-source-registry";

const source: CssfSourceDefinition = {
  localId: "circular-consolidated-test",
  familyId: "family:cssf",
  authority: "CSSF",
  jurisdiction: "LU",
  shortName: "Circular CSSF Consolidated Test",
  officialTitle: "Circular CSSF Consolidated Test",
  subject: "Reviewed subject",
  aliases: ["CSSF consolidated test"],
  language: "en",
  documentType: "circular",
  regulatoryLevel: "level-3",
  measureType: "other",
  publicationDate: "2012-12-11",
  checkedAt: "2026-08-24T00:00:00.000Z",
  pageUrl: "https://www.cssf.lu/en/Document/consolidated-test/",
  contentUrl: "https://www.cssf.lu/wp-content/uploads/consolidated-test.pdf",
  contentMediaType: "application/pdf",
  pdfProfile: "consolidated-governance",
  topics: ["governance"],
};
const hash = "b".repeat(64);
const snapshot: CssfSourceSnapshot = {
  schemaVersion: "1.0.0",
  snapshotId: `snapshot:cssf:circular-consolidated-test:${hash}`,
  provenance: "official",
  sourceSystem: "cssf",
  documentId: "lu:cssf:circular-consolidated-test",
  localId: "circular-consolidated-test",
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
  { page: 1, role: "paragraph", text: "Cover", depth: 0 },
  { page: 2, role: "paragraph", text: "Official introduction.", depth: 0 },
  { page: 3, role: "paragraph", text: "TABLE OF CONTENTS", depth: 0 },
  {
    page: 4,
    role: "heading",
    text: "Part I - Definitions and Scope",
    depth: 0,
  },
  { page: 4, role: "heading", text: "Chapter 1. Definitions", depth: 0 },
  { page: 4, role: "list-item", text: "1. For this Circular:", depth: 0 },
  { page: 4, role: "list-item", text: "1. First definition", depth: 0 },
  { page: 4, role: "list-item", text: "2. Second definition", depth: 0 },
  { page: 4, role: "heading", text: "Chapter 2. Scope", depth: 0 },
  { page: 4, role: "list-item", text: "2. Scope requirement", depth: 0 },
  { page: 4, role: "list-item", text: "3. Proportionality", depth: 0 },
  { page: 5, role: "heading", text: "Part II. Governance", depth: 0 },
  { page: 5, role: "heading", text: "Chapter 1. Administration", depth: 0 },
  { page: 5, role: "list-item", text: "1. Governance requirement", depth: 0 },
  { page: 5, role: "paragraph", text: "Continuation.", depth: 0 },
  { page: 5, role: "list-item", text: "• Control", depth: 1 },
  { page: 6, role: "heading", text: "Part III. Risk management", depth: 0 },
  { page: 6, role: "heading", text: "Chapter 1. Principles", depth: 0 },
  { page: 6, role: "list-item", text: "1. Risk requirement", depth: 0 },
  { page: 7, role: "heading", text: "Part IV. Timeline", depth: 0 },
  { page: 7, role: "list-item", text: "• Initial circular", depth: 0 },
  { page: 7, role: "paragraph", text: "Timeline continuation.", depth: 0 },
  { page: 8, role: "paragraph", text: "Annex I - Independence", depth: 0 },
  { page: 8, role: "list-item", text: "89. First annex point", depth: 0 },
  { page: 8, role: "list-item", text: "a. First condition", depth: 1 },
  { page: 8, role: "list-item", text: "90. Second annex point", depth: 0 },
  { page: 8, role: "list-item", text: "91. Third annex point", depth: 0 },
  {
    page: 9,
    role: "paragraph",
    text: "Annex II - Institution sizes",
    depth: 0,
  },
  { page: 9, role: "list-item", text: "1) Small institution", depth: 0 },
  { page: 9, role: "list-item", text: "• First condition", depth: 1 },
  { page: 9, role: "list-item", text: "2) Large institution", depth: 0 },
  { page: 9, role: "list-item", text: "• Second condition", depth: 1 },
  { page: 83, role: "paragraph", text: "CSSF contact", depth: 0 },
];

describe("CSSF consolidated tagged-PDF adapter", () => {
  it("preserves Part-local numbering, deep structure, timelines, and annexes", () => {
    const result = buildCssfConsolidatedCircularFromSemanticEvents(
      events,
      83,
      snapshot,
      source,
      "test",
    );

    expect(result.report).toEqual({
      pageCount: 83,
      structuralNodeCount: 8,
      provisionCount: 10,
      pointCount: 13,
      warningCount: 1,
    });
    expect(
      result.document.provisions.find((provision) =>
        provision.logicalId.endsWith(":part:i:provision:point-1"),
      )?.text,
    ).toBe("For this Circular:\nFirst definition\nSecond definition");

    const view = toDocumentView(result.document, "consolidated-test-build");
    expect(view.collections.map(({ id, count }) => ({ id, count }))).toEqual([
      { id: "annexes", count: 2 },
      { id: "provisions", count: 8 },
    ]);
    const repeatedPointOnes = view.provisions.filter(
      (provision) => provision.label === "Point 1",
    );
    expect(repeatedPointOnes.map((provision) => provision.number)).toEqual([
      "part-i-provision-point-1",
      "part-ii-provision-point-1",
      "part-iii-provision-point-1",
    ]);
    expect(
      new Set(repeatedPointOnes.map((provision) => provision.path)).size,
    ).toBe(3);
    expect(
      view.collections.find((collection) => collection.id === "provisions")
        ?.roots,
    ).toEqual([
      expect.objectContaining({ label: "Introduction" }),
      expect.objectContaining({ label: "Part I", type: "group" }),
      expect.objectContaining({ label: "Part II", type: "group" }),
      expect.objectContaining({ label: "Part III", type: "group" }),
      expect.objectContaining({ label: "Part IV", type: "group" }),
    ]);
  });

  it("fails closed when a Part sequence is missing", () => {
    expect(() =>
      buildCssfConsolidatedCircularFromSemanticEvents(
        events.filter((event) => event.text !== "1. Governance requirement"),
        83,
        snapshot,
        source,
        "test",
      ),
    ).toThrow("Part II has no provisions");
  });
});
