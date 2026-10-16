import { describe, expect, it } from "vitest";
import type { ExplorerNode } from "../shared/legal";
import {
  findApplicability,
  findCitationContext,
  findCitationRetrieval,
  findDocument,
  findDocumentBySlug,
  findDocumentRegulatoryContext,
  findDocumentRelationshipGraph,
  findDocumentSupervisoryDecisions,
  findDocumentVersionChain,
  findEbaQa,
  findExplorerBySlug,
  findFamilyLevel2,
  findGlobalRelationshipGraph,
  findImplementationTimeline,
  findLaws,
  findLevel2Mandates,
  findProvisionRelationships,
  findRegulatoryDossier,
  findRegulatoryPath,
  findRegulatoryTopic,
  findRelationshipGraph,
  findRelationshipPreview,
  listDocumentDefinitions,
  listEbaQa,
  listRegulatoryDossiers,
  listRegulatoryTopics,
} from "./app";

describe("Document lookup", () => {
  it("serves official Q&A separately from reviewed Dossier synthesis", () => {
    const qaCatalog = listEbaQa({ page: 1, pageSize: 10 });
    const qa = findEbaQa("2025_7613");
    const dossiers = listRegulatoryDossiers();
    const dossier = findRegulatoryDossier("major-ict-incident-reporting");

    expect(qaCatalog.total).toBe(2709);
    expect(qaCatalog.schemaVersion).toBe("1.1.0");
    expect(qaCatalog.records).toHaveLength(10);
    expect(qaCatalog.overview.detailTotal).toBe(25);
    expect(qaCatalog.overview.legalActs).toContainEqual(
      expect.objectContaining({
        label: "Regulation (EU) No 2022/2554 (DORA Reg)",
        count: 25,
        detailCount: 25,
      }),
    );
    expect(qaCatalog.overview.topics[0]?.count).toBeGreaterThan(0);
    expect(qa).toMatchObject({
      catalog: { id: "qa:eba:2025_7613", statusAtImport: "Final" },
      detail: { finalStatusLabel: "Final Q&A" },
      dossiers: [
        expect.objectContaining({ slug: "major-ict-incident-reporting" }),
      ],
    });
    expect(dossiers).toMatchObject({
      provenance: "EDITORIAL",
      records: expect.arrayContaining([
        expect.objectContaining({ slug: "major-ict-incident-reporting" }),
      ]),
    });
    expect(dossier).toMatchObject({
      schemaVersion: "1.1.0",
      dossier: {
        provenance: "EDITORIAL",
        sources: expect.arrayContaining([
          expect.objectContaining({
            targetId: "qa:eba:2025_7613",
            provenance: "OFFICIAL_QA",
          }),
        ]),
      },
      qaEvidence: expect.arrayContaining([
        expect.objectContaining({
          sourceId: "source:qa-2025-7613",
          qaId: "qa:eba:2025_7613",
          publicId: "2025_7613",
          question: expect.stringContaining("phishing"),
          finalAnswer: expect.stringContaining("private sphere"),
        }),
      ]),
    });
    expect(findEbaQa("2025_0000")).toBeNull();
    expect(findRegulatoryDossier("unknown")).toBeNull();
  });

  it("serves the reviewed Topic catalog and cross-file detail", () => {
    const catalog = listRegulatoryTopics();
    const topic = findRegulatoryTopic("major-ict-incident-reporting");

    expect(catalog.topics).toHaveLength(3);
    expect(catalog.topics).toContainEqual(
      expect.objectContaining({
        id: "topic:major-ict-incident-reporting",
        documentCount: 4,
        provisionCount: 1,
      }),
    );
    expect(topic).toMatchObject({
      topic: { id: "topic:major-ict-incident-reporting" },
      scope: {
        classificationProvenance: "EDITORIAL",
        applicabilityConclusion: false,
      },
    });
    expect(topic?.documents).toHaveLength(4);
    expect(topic?.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "MANDATES",
          provenance: "OFFICIAL_MAPPING",
          source: expect.objectContaining({
            entityId: "eu:32022R2554:article:20",
          }),
        }),
      ]),
    );
    expect(findRegulatoryTopic("unknown")).toBeNull();
  });

  it("serves reviewed DORA applicability evidence without a final determination", () => {
    const result = findApplicability("dora", "credit-institution");

    expect(result).toMatchObject({
      id: "applicability-rule:dora:credit-institution",
      entityType: { id: "credit-institution" },
      guardrails: { finalLegalDetermination: false },
    });
    expect(
      result?.result.evidence.filter((item) => item.role === "qualification"),
    ).toHaveLength(8);
    expect(findApplicability("unknown")).toBeNull();
  });

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
          kind: "consolidated-snapshot",
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
    expect(findLaws("CRR").bestMatch).toMatchObject({
      id: "eu:32013R0575",
      matchReason: "exact-alias",
      readerPath: "/read/crr/articles/1",
    });
    expect(findLaws("32013R0575").bestMatch?.id).toBe("eu:32013R0575");
    expect(findLaws("liquidity coverage ratio").bestMatch).toMatchObject({
      id: "eu:32015R0061",
      matchReason: "exact-alias",
    });
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
      101,
    );
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        entityId: "eu:32013L0036",
        kind: "document",
      }),
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

  it("serves reusable regulatory context for a representative banking provision", () => {
    const context = findDocumentRegulatoryContext(
      "eu:32013L0036",
      "eu:32013L0036:article:88",
    );

    expect(context?.domainAssignments).toContainEqual(
      expect.objectContaining({
        targetEntityId: "eu:32013L0036:article:88",
        provenance: "EDITORIAL",
        reviewStatus: "reviewed",
      }),
    );
    expect(context?.authorityRelationships).toHaveLength(2);
  });

  it("assembles citation-ready exact text and reviewed context by stable entity ID", () => {
    const entityId = "lu:cssf:circular-12-552:provision:introduction:block:7";
    const context = findCitationContext(entityId);

    expect(context).toMatchObject({
      schemaVersion: "1.0.0",
      runtime: {
        profileId: "full-corpus",
        profileVersion: "1.0.0",
      },
      retrieval: {
        method: "stable-entity-id",
        requestedEntityId: entityId,
        resolvedEntityId: entityId,
        matchType: "exact",
        rank: 1,
        score: 1,
        relationshipScope: "root-provision",
      },
      document: {
        id: "lu:cssf:circular-12-552",
        jurisdiction: "LU",
        sourceSnapshotId:
          "snapshot:cssf:circular-12-552:dbea9517a19d7946dea29f5b232faeea92e3c5227b486cfb1cd3763f907f677d",
      },
      target: {
        entityId,
        rootProvisionId: "lu:cssf:circular-12-552:provision:introduction",
        path: "/read/circular-cssf-12-552/provisions/introduction#block-7",
        sourceLocator: { kind: "pdf-page", value: "2" },
      },
    });
    expect(context?.textSegments).toEqual([
      expect.objectContaining({
        entityId,
        text: expect.stringContaining("EBA/GL/2021/05"),
        sourceLocator: { kind: "pdf-page", value: "2" },
      }),
    ]);
    expect(context?.relationships.implements).toEqual([
      expect.objectContaining({
        relationType: "IMPLEMENTS",
        target: expect.objectContaining({ entityId: "eu:eba:gl:2021:05" }),
      }),
    ]);
    expect(context?.regulatoryContext.authorityRelationships).toContainEqual(
      expect.objectContaining({
        target: expect.objectContaining({ id: "authority:lu:cssf" }),
      }),
    );

    const articleContext = findCitationContext("eu:32013L0036:article:74");
    expect(articleContext?.target.sourceLocator).toEqual({
      kind: "xpath",
      value:
        "/CONS.ACT/CONS.DOC/ENACTING.TERMS/DIVISION[7]/DIVISION[2]/DIVISION[2]/DIVISION[1]/ARTICLE[@IDENTIFIER='074']",
    });
    expect(articleContext?.textSegments).toHaveLength(8);
    expect(
      articleContext?.textSegments.map((segment) => segment.entityId),
    ).toEqual([
      "eu:32013L0036:article:74:paragraph:1",
      ...["a", "b", "c", "d", "e"].map(
        (point) => `eu:32013L0036:article:74:paragraph:1:point:${point}`,
      ),
      "eu:32013L0036:article:74:paragraph:2",
      "eu:32013L0036:article:74:paragraph:3",
    ]);
    expect(articleContext?.textSegments[7]).toMatchObject({
      entityId: "eu:32013L0036:article:74:paragraph:3",
      text: expect.stringContaining("EBA shall issue guidelines"),
    });
    expect(articleContext?.relationships.mandates).toContainEqual(
      expect.objectContaining({
        relationType: "MANDATES",
        target: expect.objectContaining({ entityId: "eu:eba:gl:2021:05" }),
      }),
    );
    expect(findCitationContext("eu:unknown:article:1")).toBeNull();
  });

  it("retrieves ranked citation-ready context from a lexical query", () => {
    const result = findCitationRetrieval(
      "translating them proportionate Luxembourg banking sector",
      { limit: 3 },
    );

    expect(result).toMatchObject({
      schemaVersion: "1.0.0",
      runtime: { profileId: "full-corpus" },
      retrieval: {
        method: "fts5-to-citation-context",
        requestedLimit: 3,
        resultCount: 1,
      },
      results: [
        {
          rank: 1,
          searchRank: 1,
          resolvedEntityId:
            "lu:cssf:circular-12-552:provision:introduction:block:7",
          resolution: "exact-search-entity",
          context: {
            target: { sourceLocator: { kind: "pdf-page", value: "2" } },
          },
        },
      ],
    });
    expect(
      findCitationRetrieval("nonexistentregulatoryphrase").results,
    ).toEqual([]);
  });

  it("serves the reviewed AI Act implementation timeline", () => {
    const timeline = findImplementationTimeline("ai-act");

    expect(timeline).toMatchObject({
      document: { id: "eu:32024R1689", slug: "ai-act" },
      runtime: { profileId: "full-corpus" },
      events: expect.arrayContaining([
        expect.objectContaining({
          eventType: "publication",
          date: "2024-07-12",
        }),
        expect.objectContaining({
          eventType: "entry-into-force",
          date: "2024-08-01",
        }),
      ]),
    });
    expect(timeline?.events.at(-1)).toMatchObject({
      eventType: "phased-application",
      date: "2028-08-02",
      source: {
        entityId:
          "eu:32024R1689:article:113:subparagraph:3:point:c:subpoint:ii",
      },
    });
    expect(findImplementationTimeline("dora")).toBeNull();
  });

  it("serves reviewed CNPD findings by GDPR provision", () => {
    const response = findDocumentSupervisoryDecisions(
      "gdpr",
      "eu:32016R0679:article:12",
    );

    expect(response).toMatchObject({
      document: { id: "eu:32016R0679", slug: "gdpr" },
      provisionId: "eu:32016R0679:article:12",
      runtime: { profileId: "full-corpus" },
      decisions: [
        {
          id: "decision:lu:cnpd:18fr-2022",
          authority: { acronym: "CNPD" },
          findings: [
            {
              relationType: "FINDS_VIOLATION_OF",
              target: { reference: "Article 12(3)–(4)" },
              evidence: { locator: "pdf-page:30" },
            },
          ],
        },
      ],
    });
    expect(findDocumentSupervisoryDecisions("dora")?.decisions).toEqual([]);
    expect(findDocumentSupervisoryDecisions("unknown")).toBeNull();
  });

  it("serves the reviewed Banking Governance multi-hop path", () => {
    const path = findRegulatoryPath("banking-governance-internal-control");

    expect(path).toMatchObject({
      schemaVersion: "1.0.0",
      id: "regulatory-path:domain:banking-governance-internal-control",
      domain: {
        id: "domain:banking-governance-internal-control",
        provenance: "EDITORIAL",
      },
      runtime: { profileId: "full-corpus" },
      scope: {
        classificationProvenance: "EDITORIAL",
        relationshipProvenance: "OFFICIAL_MAPPING",
        applicabilityConclusion: false,
      },
    });
    expect(path?.ancestors.map((domain) => domain.id)).toEqual([
      "domain:financial-regulation",
      "domain:banking",
    ]);
    expect(path?.documents.map((document) => document.id)).toEqual(
      expect.arrayContaining([
        "eu:32013L0036",
        "eu:eba:gl:2021:05",
        "lu:cssf:circular-12-552",
      ]),
    );
    expect(
      path?.relationships.map((relationship) => ({
        relationType: relationship.relationType,
        source: relationship.source.entityId,
        target: relationship.target.entityId,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          relationType: "MANDATES",
          source: "eu:32013L0036:article:74",
          target: "eu:eba:gl:2021:05",
        },
        {
          relationType: "SUPPLEMENTS",
          source: "eu:eba:gl:2021:05:paragraph:5",
          target: "eu:32013L0036:article:74",
        },
        {
          relationType: "IMPLEMENTS",
          source: "lu:cssf:circular-12-552:provision:introduction:block:7",
          target: "eu:eba:gl:2021:05",
        },
      ]),
    );
    expect(findRegulatoryPath("unknown-domain")).toBeNull();
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

  it("serves a deterministic Level 2 mandate query from reviewed relationships", () => {
    const result = findLevel2Mandates(
      "eu:32022R2554",
      "eu:32022R2554:article:28",
    );

    expect(result).toMatchObject({
      documentId: "eu:32022R2554",
      provisionId: "eu:32022R2554:article:28",
    });
    expect(result?.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "MANDATES",
          provenance: "OFFICIAL_MAPPING",
          target: expect.objectContaining({
            entityId: "eu:32024R1773",
            documentShortName: "DORA RTS ICT Third-Party Policy",
          }),
        }),
        expect.objectContaining({
          relationType: "MANDATES",
          provenance: "OFFICIAL_MAPPING",
          target: expect.objectContaining({
            entityId: "eu:32024R2956",
            documentShortName: "DORA ITS Register of Information",
          }),
        }),
      ]),
    );
    expect(findLevel2Mandates("eu:32022R2554", "eu:unknown")).toBeNull();
  });

  it("serves a family Level 2 library without reading curated mapping source data", () => {
    const dora = findFamilyLevel2("dora", "rts");
    expect(dora).toMatchObject({
      familyId: "family:dora",
      counts: { rts: 8, its: 2, guidelines: 0 },
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
        expect.objectContaining({
          id: "eu:32025R0532",
          mandates: [],
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
