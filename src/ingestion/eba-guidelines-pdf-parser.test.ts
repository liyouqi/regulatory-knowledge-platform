import { describe, expect, it } from "vitest";
import { buildEbaGuidelinesFromSemanticEvents } from "./eba-guidelines-pdf-parser";
import { ebaSourceSnapshotSchema } from "./eba-snapshot";
import { loadEbaSourceRegistrySync } from "./eba-source-registry";
import type { TaggedPdfSemanticEvent } from "./tagged-pdf";

const hash = "a".repeat(64);
const snapshot = ebaSourceSnapshotSchema.parse({
  schemaVersion: "1.0.0",
  snapshotId: `snapshot:eba:eba-gl-2021-05:${hash}`,
  provenance: "official",
  sourceSystem: "eba",
  documentId: "eu:eba:gl:2021:05",
  localId: "eba-gl-2021-05",
  language: "en",
  retrievedAt: "2026-08-26T00:00:00.000Z",
  canonicalUrl:
    "https://www.eba.europa.eu/activities/single-rulebook/regulatory-activities/internal-governance/guidelines-internal-governance-under-crd",
  page: {
    url: "https://www.eba.europa.eu/source",
    mediaType: "text/html",
    etag: null,
    lastModified: null,
    sha256: `sha256:${hash}`,
    bytes: 1,
    file: "page.html",
  },
  content: {
    url: "https://www.eba.europa.eu/source.pdf",
    mediaType: "application/pdf",
    etag: null,
    lastModified: null,
    sha256: `sha256:${hash}`,
    bytes: 1,
    file: "content.pdf",
  },
});
const registered = loadEbaSourceRegistrySync()[0];
if (!registered) throw new Error("Missing EBA source fixture");
const { quality: _quality, ...source } = registered;

function fixtureEvents(): TaggedPdfSemanticEvent[] {
  return [
    {
      page: 13,
      role: "paragraph",
      text: "Excluded front matter",
      depth: 0,
    },
    {
      page: 14,
      role: "heading",
      text: "1. Compliance and reporting obligations",
      depth: 0,
    },
    ...Array.from({ length: 234 }, (_, index) => ({
      page: 14 + Math.floor(index / 5),
      role: "list-item" as const,
      text: `${index + 1}. Exact guideline paragraph ${index + 1}.`,
      depth: 0,
    })),
    {
      page: 63,
      role: "paragraph" as const,
      text: "Annex I – Aspects to take into account when developing an internal governance policy",
      depth: 0,
    },
    {
      page: 63,
      role: "paragraph" as const,
      text: "Exact annex introduction.",
      depth: 0,
    },
    {
      page: 65,
      role: "paragraph" as const,
      text: "Excluded accompanying document",
      depth: 0,
    },
  ];
}

describe("EBA Guidelines PDF parser", () => {
  it("keeps the 234-paragraph legal body and Annex separate from report material", () => {
    const result = buildEbaGuidelinesFromSemanticEvents(
      fixtureEvents(),
      93,
      snapshot,
      source,
    );

    expect(result.report).toEqual({
      pageCount: 93,
      structuralNodeCount: 1,
      provisionCount: 235,
      blockCount: 235,
      warningCount: 2,
    });
    expect(result.document.provisions).toContainEqual(
      expect.objectContaining({
        logicalId: "eu:eba:gl:2021:05:paragraph:234",
        label: "Paragraph 234",
      }),
    );
    expect(JSON.stringify(result.document.provisions)).not.toContain(
      "Excluded accompanying document",
    );
  });

  it("fails closed when numbered paragraphs are not contiguous", () => {
    const events = fixtureEvents().filter(
      (event) => !event.text.startsWith("100. "),
    );
    expect(() =>
      buildEbaGuidelinesFromSemanticEvents(events, 93, snapshot, source),
    ).toThrow(/not contiguous/u);
  });
});
