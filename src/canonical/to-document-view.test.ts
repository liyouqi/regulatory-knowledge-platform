import { describe, expect, it } from "vitest";
import { doraCanonicalFixture } from "../data/dora-fixture";
import type { CanonicalDocument } from "./schema";
import { toDocumentView } from "./to-document-view";

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
    const view = toDocumentView(fixtureWithChapter(), "test-build");
    const first = view.provisions[0];
    const second = view.provisions[1];

    expect(first.path).toBe("/read/dora/articles/1");
    expect(view).toMatchObject({
      documentType: "regulation",
      lastChecked: doraCanonicalFixture.source.retrievedAt,
      sourceVersion: doraCanonicalFixture.source.sourceVersion,
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
});
