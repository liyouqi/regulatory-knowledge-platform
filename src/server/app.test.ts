import { describe, expect, it } from "vitest";
import type { ExplorerNode } from "../shared/legal";
import {
  findDocument,
  findDocumentBySlug,
  findDocumentRelationshipGraph,
  findDocumentVersionChain,
  findExplorerBySlug,
  findFamilyLevel2,
  findGlobalRelationshipGraph,
  findLaws,
  findProvisionRelationships,
  findRelationshipGraph,
  findRelationshipPreview,
  listDocumentDefinitions,
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

  it("serves reviewed document version status without inventing amendments", () => {
    const chain = findDocumentVersionChain("eu:32024R2956");

    expect(chain?.coverage).toBe("source-status-only");
    expect(chain?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "original-oj-snapshot",
          availability: "loaded",
        }),
        expect.objectContaining({
          kind: "corrigendum",
          date: "2025-09-19",
          availability: "external",
        }),
      ]),
    );
    expect(chain?.edges.map((edge) => edge.relationType)).not.toContain(
      "AMENDED_BY",
    );
    expect(findDocumentVersionChain("eu:32022R2554")).toBeNull();
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

  it("serves TF-IDF relevance separately from legal-text relationships", () => {
    const result = findProvisionRelationships(
      "eu:32022R2554",
      "eu:32022R2554:article:20",
    );

    expect(result?.relatedRecitals).toContainEqual(
      expect.objectContaining({
        relationType: "RELATED_RECITAL",
        provenance: "TFIDF",
        target: expect.objectContaining({
          entityId: "eu:32022R2554:recital:53",
        }),
        score: expect.any(Number),
      }),
    );
  });

  it("projects existing relationships into a UI-owned focused graph", () => {
    const graph = findRelationshipGraph("dora", "articles", "20");

    expect(graph).toMatchObject({
      documentId: "eu:32022R2554",
      provisionId: "eu:32022R2554:article:20",
      nodes: expect.arrayContaining([
        expect.objectContaining({
          entityId: "eu:32022R2554:article:20",
          role: "center",
        }),
        expect.objectContaining({
          entityId: "eu:32025R0301",
          role: "neighbor",
        }),
        expect.objectContaining({
          entityId: "eu:32025R0302",
          role: "neighbor",
        }),
      ]),
      edges: expect.arrayContaining([
        expect.objectContaining({
          relationType: "MANDATES",
          provenance: "OFFICIAL_MAPPING",
        }),
        expect.objectContaining({
          relationType: "RELATED_RECITAL",
          provenance: "TFIDF",
        }),
      ]),
    });
    expect(graph?.nodes[0]).not.toHaveProperty("position");
  });

  it("does not misstate document-scoped metadata as an Article graph edge", () => {
    const graph = findRelationshipGraph(
      "dora-rts-ict-risk-management",
      "articles",
      "1",
    );

    expect(
      graph?.edges.filter(
        (relationship) => relationship.provenance === "OFFICIAL_METADATA",
      ),
    ).toEqual([]);
    expect(graph?.edges).not.toContainEqual(
      expect.objectContaining({
        relationType: "ADOPTED_UNDER",
        provenance: "OFFICIAL_MAPPING",
      }),
    );
    expect(graph?.edges).not.toContainEqual(
      expect.objectContaining({ relationType: "AMENDS" }),
    );
    expect(graph?.edges).not.toContainEqual(
      expect.objectContaining({ relationType: "CORRECTS" }),
    );
  });

  it("projects reviewed cross-document relations into a document graph", () => {
    const graph = findDocumentRelationshipGraph("dora");

    expect(graph).toMatchObject({
      documentId: "eu:32022R2554",
      nodes: expect.arrayContaining([
        expect.objectContaining({
          entityId: "eu:32022R2554",
          kind: "document",
          role: "center",
        }),
        expect.objectContaining({
          entityId: "eu:32025R0301",
          kind: "document",
          role: "neighbor",
        }),
        expect.objectContaining({
          entityId: "eu:32009R1060",
          kind: "external-work",
          role: "neighbor",
          sourceUrl: expect.stringContaining(
            "https://publications.europa.eu/resource/cellar/",
          ),
        }),
      ]),
      edges: expect.arrayContaining([
        expect.objectContaining({
          relationType: "ADOPTED_UNDER",
          provenance: "OFFICIAL_METADATA",
        }),
        expect.objectContaining({
          relationType: "MANDATES",
          provenance: "OFFICIAL_MAPPING",
        }),
        expect.objectContaining({
          relationType: "AMENDS",
          provenance: "OFFICIAL_METADATA",
        }),
        expect.objectContaining({
          relationType: "CORRECTS",
          provenance: "OFFICIAL_METADATA",
        }),
      ]),
    });
    expect(
      graph?.nodes.find((node) => node.entityId === "eu:32009R1060"),
    ).not.toHaveProperty("path");
    expect(graph?.edges.some((edge) => edge.source === edge.target)).toBe(
      false,
    );
    expect(findDocumentRelationshipGraph("unknown-law")).toBeNull();
  });

  it("projects reviewed CJEU cases only into the Act-level GDPR graph", () => {
    const graph = findDocumentRelationshipGraph("gdpr");

    expect(graph?.nodes.filter((node) => node.kind === "case")).toHaveLength(
      72,
    );
    expect(graph?.nodes).toContainEqual(
      expect.objectContaining({
        entityId: "case:eu:62017CJ0496",
        kind: "case",
        label: "Case C-496/17.",
        title: "Deutsche Post AG v Hauptzollamt Köln.",
        ecli: "ECLI:EU:C:2019:26",
        decisionType: "judgment",
        role: "neighbor",
      }),
    );
    expect(graph?.edges).toContainEqual(
      expect.objectContaining({
        source: "case:eu:62017CJ0496",
        target: "eu:32016R0679",
        relationType: "INTERPRETS",
        provenance: "OFFICIAL_METADATA",
      }),
    );
    expect(
      findDocumentRelationshipGraph("dora")?.nodes.some(
        (node) => node.kind === "case",
      ),
    ).toBe(false);
  });

  it("projects one connected global network while retaining metadata-only layers", () => {
    const graph = findGlobalRelationshipGraph();

    expect(graph.scope).toBe("global");
    expect(graph.nodes.filter((node) => node.kind === "document")).toHaveLength(
      16,
    );
    expect(
      graph.nodes.filter((node) => node.kind === "external-work").length,
    ).toBeGreaterThan(0);
    expect(graph.nodes.filter((node) => node.kind === "case")).toHaveLength(72);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "MANDATES",
          provenance: "OFFICIAL_MAPPING",
        }),
        expect.objectContaining({
          relationType: "AMENDS",
          provenance: "OFFICIAL_METADATA",
        }),
        expect.objectContaining({
          relationType: "INTERPRETS",
          provenance: "OFFICIAL_METADATA",
        }),
      ]),
    );
    expect(graph.edges.some((edge) => edge.source === edge.target)).toBe(false);
  });

  it("serves a target preview on demand for Side Peek", () => {
    expect(findRelationshipPreview("eu:32022L2555:article:3")).toMatchObject({
      documentShortName: "NIS2",
      label: "Article 3",
      excerpt: expect.any(String),
    });
  });

  it("serves exact document definitions for Reader term previews", () => {
    const response = listDocumentDefinitions("eu:32022R2554");

    expect(response?.definitions).toContainEqual(
      expect.objectContaining({
        term: "digital operational resilience",
        normalizedTerm: "digital operational resilience",
        definitionText: expect.stringContaining(
          "digital operational resilience means",
        ),
        sourceUrl: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng",
        provisionId: "eu:32022R2554:article:3",
        path: "/read/dora/articles/3#subparagraph-1-point-1",
      }),
    );
    expect(listDocumentDefinitions("eu:unknown")).toBeNull();
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
    const dora = findFamilyLevel2("dora", "rts");
    expect(dora).toMatchObject({
      familyId: "family:dora",
      counts: { rts: 4, its: 2, guidelines: 0 },
    });
    expect(dora?.measures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "eu:32024R1774",
          mandates: expect.arrayContaining([
            expect.objectContaining({ label: "Article 15" }),
          ]),
        }),
        expect.objectContaining({
          id: "eu:32024R1773",
          mandates: expect.arrayContaining([
            expect.objectContaining({ label: "Article 28" }),
          ]),
        }),
        expect.objectContaining({
          id: "eu:32024R1772",
          mandates: expect.arrayContaining([
            expect.objectContaining({ label: "Article 18" }),
          ]),
        }),
        expect.objectContaining({
          id: "eu:32025R0301",
          mandates: expect.arrayContaining([
            expect.objectContaining({ label: "Article 20" }),
          ]),
        }),
      ]),
    );
    expect(findFamilyLevel2("dora", "its")?.measures).toContainEqual(
      expect.objectContaining({
        id: "eu:32024R2956",
        sourceStatus: expect.objectContaining({
          corrections: [expect.objectContaining({ date: "2025-09-19" })],
        }),
      }),
    );
    expect(findFamilyLevel2("dora", "its")?.measures).toContainEqual(
      expect.objectContaining({
        id: "eu:32025R0302",
        mandates: expect.arrayContaining([
          expect.objectContaining({ label: "Article 20" }),
        ]),
      }),
    );
  });
});
