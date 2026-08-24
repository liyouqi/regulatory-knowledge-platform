import { describe, expect, it } from "vitest";
import { doraCanonicalFixture } from "../data/dora-fixture";
import { documentViewSchema } from "../shared/legal";
import type { CanonicalDocument, Provision } from "./schema";
import { toDocumentView } from "./to-document-view";

function cssfCommunicationFixture(): CanonicalDocument {
  const document = structuredClone(doraCanonicalFixture);
  const documentId = "lu:cssf:communication-test";
  const snapshotId = "snapshot:cssf:communication-test:fixture";
  const sourceVersion = "cssf-html-test";
  const provision = (
    suffix: string,
    displayOrder: number,
    label: string,
    text: string,
    parentLogicalId?: string,
  ): Provision => {
    const logicalId = `${documentId}:${suffix}`;
    return {
      logicalId,
      sourceVersionId: `${logicalId}@${sourceVersion}`,
      sourceSnapshotId: snapshotId,
      displayOrder,
      sourceLocator: { kind: "fixture", value: suffix },
      parserWarnings: [],
      kind: "other",
      numberNormalized: suffix.endsWith("introduction")
        ? "introduction"
        : undefined,
      label,
      text,
      contentHash:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      parentLogicalId,
      structuralPath: [],
    };
  };
  const introductionId = `${documentId}:provision:introduction`;
  document.logicalId = documentId;
  document.sourceVersionId = `${documentId}@${sourceVersion}`;
  document.sourceSnapshotId = snapshotId;
  document.jurisdiction = "LU";
  document.documentType = "other";
  document.identifiers = { localId: "communication-test" };
  document.familyIds = ["family:cssf"];
  document.shortName = "CSSF Communication Test";
  document.officialTitle = "Reviewed CSSF communication";
  document.structuralNodes = [];
  document.provisions = [
    provision("provision:introduction", 1, "Introduction", "Opening text"),
    provision(
      "provision:introduction:block:introduction-1",
      2,
      "Paragraph",
      "Opening text",
      introductionId,
    ),
    provision("provision:section-1", 3, "Section 1", "Section text"),
  ];
  document.source = {
    ...document.source,
    id: snapshotId,
    sourceSystem: "cssf",
    canonicalUrl: "https://www.cssf.lu/en/test/",
    contentUrl: "https://www.cssf.lu/en/test/",
    sourceVersion,
  };
  return document;
}

function fixtureWithChapter(): CanonicalDocument {
  const document = structuredClone(doraCanonicalFixture);
  const chapterId = `${document.logicalId}:chapter:i`;
  document.structuralNodes = [
    {
      logicalId: chapterId,
      sourceVersionId: `${chapterId}@${document.source.sourceVersion}`,
      sourceSnapshotId: document.sourceSnapshotId,
      displayOrder: 1,
      sourceLocator: { kind: "fixture", value: "chapter-i" },
      parserWarnings: [],
      kind: "chapter",
      numberRaw: "I",
      numberNormalized: "i",
      label: "CHAPTER I",
      title: "General provisions",
      parentLogicalId: document.logicalId,
    },
  ];
  for (const provision of document.provisions) {
    if (provision.kind !== "article") continue;
    provision.parentLogicalId = chapterId;
    provision.structuralPath = [
      { logicalId: chapterId, kind: "chapter", label: "CHAPTER I" },
    ];
  }
  return document;
}

describe("structured Reader DTO", () => {
  it("builds an adaptive hierarchy and article range", () => {
    const view = toDocumentView(fixtureWithChapter(), "test-build");
    const articles = view.collections.find(
      (collection) => collection.id === "articles",
    );

    expect(articles?.roots[0]).toMatchObject({
      id: "eu:32022R2554:chapter:i",
      type: "group",
      kind: "chapter",
      label: "CHAPTER I",
      title: "General provisions",
      range: "Art. 1–2",
    });
    expect(articles?.roots[0].children).toHaveLength(2);
  });

  it("adds stable routes, breadcrumbs, body anchors, and adjacent navigation", () => {
    const document = fixtureWithChapter();
    document.source.sourceStatus = {
      basis: "original-oj",
      textAsOf: "2022-12-27",
      currentVersionUrl: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng",
      corrections: [],
    };
    const view = toDocumentView(document, "test-build");
    const first = view.provisions[0];
    const second = view.provisions[1];

    expect(first.path).toBe("/read/dora/articles/1");
    expect(view).toMatchObject({
      jurisdiction: "EU",
      documentType: "regulation",
      lastChecked: doraCanonicalFixture.source.retrievedAt,
      sourceVersion: doraCanonicalFixture.source.sourceVersion,
      sourceStatus: document.source.sourceStatus,
    });
    expect(first.breadcrumbs[0]).toMatchObject({
      label: "CHAPTER I",
      title: "General provisions",
    });
    expect(first.blocks[0]).toMatchObject({
      id: "eu:32022R2554:article:1:paragraph:1",
      anchor: "paragraph-1",
    });
    expect(first.nextId).toBe(second.id);
    expect(second.previousId).toBe(first.id);
  });

  it("maps non-EU top-level provisions without inventing Articles or CELEX", () => {
    const view = documentViewSchema.parse(
      toDocumentView(cssfCommunicationFixture(), "cssf-test-build"),
    );

    expect(view).toMatchObject({
      id: "lu:cssf:communication-test",
      jurisdiction: "LU",
      localId: "communication-test",
      celex: undefined,
    });
    expect(view.collections).toEqual([
      expect.objectContaining({
        id: "provisions",
        label: "Provisions",
        count: 2,
      }),
    ]);
    expect(view.provisions[0]).toMatchObject({
      kind: "other",
      collectionId: "provisions",
      path: "/read/cssf-communication-test/provisions/introduction",
      blocks: [expect.objectContaining({ text: "Opening text" })],
    });
    expect(view.provisions[0].nextId).toBe(view.provisions[1].id);
  });
});
