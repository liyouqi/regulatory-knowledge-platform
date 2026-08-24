import { describe, expect, it } from "vitest";
import { doraCanonicalFixture } from "../data/dora-fixture";
import { explorerDocumentSchema } from "../shared/legal";
import { toDocumentView } from "./to-document-view";
import { toExplorerView } from "./to-explorer-view";

describe("Explorer DTO", () => {
  it("reuses Reader IDs and paths without including legal body text", () => {
    const reader = toDocumentView(doraCanonicalFixture, "explorer-test");
    const explorer = explorerDocumentSchema.parse(toExplorerView(reader));
    const first = explorer.roots[0];

    expect(explorer).toMatchObject({
      id: reader.id,
      articleCount: 2,
      recitalCount: 0,
      annexCount: 0,
      provisionCount: 0,
    });
    expect(first).toMatchObject({
      id: "eu:32022R2554:article:1",
      type: "article",
      anchor: "article-1",
      readerPath: "/read/dora/articles/1",
    });
    expect(JSON.stringify(explorer)).not.toContain(
      "This Regulation lays down uniform requirements",
    );
  });

  it("exposes generic provision roots for a Luxembourg document", () => {
    const reader = toDocumentView(doraCanonicalFixture, "explorer-test");
    reader.id = "lu:cssf:test";
    reader.jurisdiction = "LU";
    reader.celex = undefined;
    reader.localId = "test";
    reader.collections = [
      {
        id: "provisions",
        label: "Provisions",
        count: 1,
        roots: [
          {
            id: "lu:cssf:test:provision:introduction",
            type: "provision",
            kind: "other",
            label: "Introduction",
            provisionId: "lu:cssf:test:provision:introduction",
            children: [],
          },
        ],
      },
    ];
    reader.provisions = [
      {
        id: "lu:cssf:test:provision:introduction",
        kind: "other",
        collectionId: "provisions",
        number: "introduction",
        label: "Introduction",
        path: "/read/cssf-test/provisions/introduction",
        explorerAnchor: "provision-introduction",
        breadcrumbs: [],
        blocks: [],
      },
    ];

    const explorer = explorerDocumentSchema.parse(toExplorerView(reader));
    expect(explorer).toMatchObject({
      jurisdiction: "LU",
      localId: "test",
      articleCount: 0,
      provisionCount: 1,
      roots: [
        {
          type: "provision",
          readerPath: "/read/cssf-test/provisions/introduction",
        },
      ],
    });
  });
});
