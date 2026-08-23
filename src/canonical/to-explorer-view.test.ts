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
});
