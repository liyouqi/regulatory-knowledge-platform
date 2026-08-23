import { describe, expect, it } from "vitest";
import type { ExplorerNode } from "../shared/legal";
import { findDocument, findDocumentBySlug, findExplorerBySlug } from "./app";

describe("Document lookup", () => {
  it("returns the DORA fixture by stable document ID", async () => {
    const document = findDocument("eu:32022R2554");

    expect(document?.id).toBe("eu:32022R2554");
    expect(["official", "fixture"]).toContain(document?.provenance);
    expect(document?.provisions[0].blocks[0].id).toBe(
      "eu:32022R2554:article:1:paragraph:1",
    );
  });

  it("returns null for an unknown stable document ID", () => {
    expect(findDocument("eu:32099R0000")).toBeNull();
  });

  it("resolves a document by its stable reader slug", () => {
    expect(findDocumentBySlug("dora")?.id).toBe("eu:32022R2554");
    expect(findDocumentBySlug("unknown-law")).toBeNull();
  });

  it("serves a lightweight Explorer over the same stable Article IDs", () => {
    const explorer = findExplorerBySlug("dora");
    const nodes = explorer?.roots.flatMap(function flatten(
      node: ExplorerNode,
    ): ExplorerNode[] {
      return [node, ...node.children.flatMap(flatten)];
    });
    const firstArticle = nodes?.find((node) => node.type === "article");

    expect(firstArticle).toMatchObject({
      id: "eu:32022R2554:article:1",
      readerPath: "/read/dora/articles/1",
    });
    expect(JSON.stringify(explorer)).not.toContain(
      "This Regulation lays down uniform requirements",
    );
  });
});
