import { describe, expect, it } from "vitest";
import type { ExplorerNode } from "../shared/legal";
import {
  findDocument,
  findDocumentBySlug,
  findExplorerBySlug,
  findFamilyLevel2,
  findLaws,
  findProvisionRelationships,
  findRelationshipPreview,
} from "./app";

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

  it("finds laws by alias, CELEX, and structured citation", () => {
    expect(findLaws("DORA").bestMatch).toMatchObject({
      id: "eu:32022R2554",
      matchReason: "exact-alias",
    });
    expect(findLaws("32022R2554").bestMatch?.id).toBe("eu:32022R2554");
    expect(findLaws("Regulation (EU) 2022/2554").bestMatch?.id).toBe(
      "eu:32022R2554",
    );
  });

  it("resolves a compound law and provision query without returning body data", () => {
    const result = findLaws("DORA article 3").bestMatch;

    expect(result?.target).toMatchObject({
      kind: "article",
      label: "Article 3",
      path: "/read/dora/articles/3",
    });
    expect(result).not.toHaveProperty("provisions");
    expect(result).not.toHaveProperty("blocks");
  });

  it("serves traceable provision relationships from the runtime repository", () => {
    const result = findProvisionRelationships(
      "eu:32022R2554",
      "eu:32022R2554:article:1",
    );
    expect(result?.references).toContainEqual(
      expect.objectContaining({
        provenance: "LEGAL_TEXT",
        target: expect.objectContaining({
          entityId: "eu:32022L2555:article:3",
        }),
        evidence: expect.objectContaining({
          text: "Article 3 of Directive (EU) 2022/2555",
        }),
      }),
    );
  });

  it("serves a target preview on demand for Side Peek", () => {
    expect(findRelationshipPreview("eu:32022L2555:article:3")).toMatchObject({
      documentShortName: "NIS2",
      label: "Article 3",
      excerpt: expect.any(String),
    });
  });

  it("serves official Level 2 mandates separately from explicit references", () => {
    const result = findProvisionRelationships(
      "eu:32023R1114",
      "eu:32023R1114:article:62",
    );
    expect(result?.mandates).toContainEqual(
      expect.objectContaining({
        relationType: "MANDATES",
        provenance: "OFFICIAL_MAPPING",
        target: expect.objectContaining({ entityId: "eu:32025R0305" }),
      }),
    );
  });

  it("serves a family Level 2 library without reading curated mapping source data", () => {
    expect(findFamilyLevel2("dora", "rts")).toMatchObject({
      familyId: "family:dora",
      measures: [
        expect.objectContaining({
          id: "eu:32024R1774",
          mandates: expect.arrayContaining([
            expect.objectContaining({ label: "Article 15" }),
          ]),
        }),
      ],
    });
  });
});
