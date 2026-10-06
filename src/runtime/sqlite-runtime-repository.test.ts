import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toExplorerView } from "../canonical/to-explorer-view";
import { loadDocumentViews } from "../data/document-repository";
import { loadCssfSourceRegistrySync } from "../ingestion/cssf-source-registry";
import { loadEbaSourceRegistrySync } from "../ingestion/eba-source-registry";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import { buildRuntimeDatabase } from "../search/sqlite-search-index";
import { SqliteRuntimeRepository } from "./sqlite-runtime-repository";

const testDirectory = mkdtempSync(join(tmpdir(), "regulatory-runtime-"));
const databasePath = join(testDirectory, "regulatory.sqlite");
const documents = loadDocumentViews();
const sources = [
  ...loadSourceRegistrySync(),
  ...loadCssfSourceRegistrySync(),
  ...loadEbaSourceRegistrySync(),
];
const dora = documents.find((document) => document.slug === "dora");
if (!dora) throw new Error("DORA test document is unavailable");
let repository: SqliteRuntimeRepository | undefined;

beforeAll(() => {
  buildRuntimeDatabase(documents, sources, databasePath);
  repository = new SqliteRuntimeRepository(databasePath);
});

afterAll(() => {
  repository?.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("SQLite runtime repository", () => {
  it("returns a Reader payload identical to the validated DocumentView", () => {
    expect(repository?.listDocumentViews()).toEqual(documents);
    for (const document of documents) {
      expect(repository?.findDocument(document.id)).toEqual(document);
      expect(repository?.findDocumentBySlug(document.slug)).toEqual(document);
    }
  });

  it("returns an Explorer payload identical to the canonical projection", () => {
    for (const document of documents) {
      expect(repository?.findExplorerBySlug(document.slug)).toEqual(
        toExplorerView(document),
      );
    }
  });

  it("serves metadata and reviewed aliases without reading source files", () => {
    expect(repository?.listDocumentSummaries()).toHaveLength(documents.length);
    expect(repository?.listDocumentSummaries()).toContainEqual({
      id: dora.id,
      slug: "dora",
      shortName: "DORA",
      officialTitle: dora.officialTitle,
      defaultPath: dora.provisions[0].path,
      hasImplementationTimeline: false,
      hasSupervisoryDecisions: false,
      hasApplicabilityRules: true,
      hasTopicAssignments: true,
      provenance: dora.provenance,
      familyId: "family:dora",
      regulatoryLevel: "level-1",
      measureType: "primary-act",
    });
    expect(repository?.listLawSearchSources()).toContainEqual({
      celex: "32022R2554",
      familyId: "family:dora",
      regulatoryLevel: "level-1",
      measureType: "primary-act",
      aliases: [
        "Digital Operational Resilience Act",
        "Digital Operational Resilience Regulation",
      ],
    });
  });

  it("returns reviewed DORA scope evidence and relationship navigation", () => {
    const result = repository?.findApplicabilityBySlug(
      "dora",
      "credit-institution",
    );

    expect(result).toMatchObject({
      schemaVersion: "1.0.0",
      id: "applicability-rule:dora:credit-institution",
      runtime: { buildId: repository?.buildId, profileId: "full-corpus" },
      document: { id: "eu:32022R2554", slug: "dora" },
      entityType: { id: "credit-institution", label: "Credit institution" },
      result: {
        status: "listed-in-scope-subject-to-qualifications",
        scopeProvision: { entityId: "eu:32022R2554:article:2" },
      },
      guardrails: {
        finalLegalDetermination: false,
        profileControlsVisibilityOnly: true,
      },
    });
    expect(result?.result.evidence).toHaveLength(10);
    expect(result?.result.evidence[1]).toMatchObject({
      role: "entity-listing",
      evidenceText: "credit institutions;",
      provenance: "LEGAL_TEXT",
    });
    expect(
      result?.result.navigation.map((item) => item.provision.entityId),
    ).toEqual(["eu:32022R2554:article:20", "eu:32022R2554:article:28"]);
    expect(result?.result.navigation[0]?.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "MANDATES",
          provenance: "OFFICIAL_MAPPING",
        }),
      ]),
    );
    expect(repository?.findApplicabilityBySlug("unknown")).toBeNull();
    expect(
      repository?.findApplicabilityBySlug(
        "dora",
        "crypto-asset-service-provider",
      ),
    ).toBeNull();
    expect(repository).toMatchObject({
      applicabilityRuleCount: 1,
      applicabilityEvidenceCount: 10,
    });
  });

  it("returns reviewed cross-file Topics and exact assignments", () => {
    expect(repository?.listRegulatoryTopics()).toHaveLength(3);
    expect(repository?.listTopicAssignments()).toHaveLength(10);
    expect(
      repository?.listTopicAssignments("topic:major-ict-incident-reporting"),
    ).toHaveLength(4);
    expect(
      repository
        ?.listTopicAssignments("topic:major-ict-incident-reporting")
        .find(
          (assignment) =>
            assignment.targetEntityId === "eu:32022R2554:article:20",
        ),
    ).toMatchObject({
      targetKind: "provision",
      targetPath: "/read/dora/articles/20",
      role: "primary",
      provenance: "EDITORIAL",
    });
    expect(repository).toMatchObject({
      regulatoryTopicTaxonomyId: "taxonomy:regulatory-topic",
      topicCount: 3,
      topicAssignmentCount: 10,
    });
  });

  it("returns the reviewed AI Act implementation timeline from Runtime", () => {
    const timeline = repository?.findImplementationTimelineBySlug("ai-act");

    expect(timeline).toMatchObject({
      schemaVersion: "1.0.0",
      id: "timeline:eu:32024R1689:implementation",
      version: "1.1.0",
      document: { id: "eu:32024R1689", slug: "ai-act" },
      runtime: { buildId: repository?.buildId, profileId: "full-corpus" },
    });
    expect(timeline?.events).toHaveLength(9);
    expect(timeline?.events[1]).toMatchObject({
      date: "2024-08-01",
      dateBasis: "calculated-from-publication",
      provenance: "DERIVED",
      source: {
        entityId: "eu:32024R1689:article:113:subparagraph:1",
        sourceLocator: { kind: "xpath" },
      },
    });
    expect(repository?.findImplementationTimelineBySlug("dora")).toBeNull();
    expect(repository?.findImplementationTimelineBySlug("unknown")).toBeNull();
    expect(repository).toMatchObject({ timelineEventCount: 9 });
    expect(
      repository
        ?.listDocumentSummaries()
        .find((document) => document.slug === "ai-act"),
    ).toMatchObject({ hasImplementationTimeline: true });
  });

  it("returns the reviewed CNPD decision and provision-level findings", () => {
    const decisions =
      repository?.findDocumentSupervisoryDecisions("eu:32016R0679");

    expect(decisions).toMatchObject({
      schemaVersion: "1.0.0",
      document: { id: "eu:32016R0679", slug: "gdpr" },
      runtime: { buildId: repository?.buildId, profileId: "full-corpus" },
      decisions: [
        {
          id: "decision:lu:cnpd:18fr-2022",
          decisionNumber: "18FR/2022",
          authority: { id: "authority:lu:cnpd", acronym: "CNPD" },
          outcome: { amountMinor: 150000, currency: "EUR" },
        },
      ],
    });
    expect(decisions?.decisions[0]?.findings).toHaveLength(4);
    expect(
      repository?.findDocumentSupervisoryDecisions(
        "eu:32016R0679",
        "eu:32016R0679:article:15",
      )?.decisions[0]?.findings,
    ).toEqual([
      expect.objectContaining({
        relationType: "FINDS_VIOLATION_OF",
        provenance: "DECISION_TEXT",
        target: expect.objectContaining({ reference: "Article 15(1)(b)–(c)" }),
        evidence: expect.objectContaining({ locator: "pdf-page:30" }),
      }),
    ]);
    expect(
      repository?.findDocumentSupervisoryDecisions("eu:32022R2554")?.decisions,
    ).toEqual([]);
    expect(
      repository?.findDocumentSupervisoryDecisions(
        "eu:32016R0679",
        "eu:32016R0679:article:999",
      ),
    ).toBeNull();
    expect(repository).toMatchObject({
      supervisoryDecisionCount: 1,
      supervisoryDecisionFindingCount: 4,
    });
    expect(
      repository
        ?.listDocumentSummaries()
        .find((document) => document.slug === "gdpr"),
    ).toMatchObject({ hasSupervisoryDecisions: true });
  });

  it("returns null for unknown document and Explorer identities", () => {
    expect(repository?.findDocument("eu:unknown")).toBeNull();
    expect(repository?.findDocumentBySlug("unknown")).toBeNull();
    expect(repository?.findExplorerBySlug("unknown")).toBeNull();
  });

  it("returns versioned regulatory Domain and Authority context without mixing provenance", () => {
    const context = repository?.findDocumentRegulatoryContext(
      "eu:32013L0036",
      "eu:32013L0036:article:74",
    );

    expect(context).toMatchObject({
      documentId: "eu:32013L0036",
      provisionId: "eu:32013L0036:article:74",
      buildId: repository?.buildId,
      profileId: "full-corpus",
      taxonomyId: "taxonomy:regulatory-domain",
      taxonomyVersion: "1.1.0",
    });
    expect(context?.domainAssignments).toHaveLength(2);
    expect(context?.domainAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetKind: "document",
          role: "contains",
          provenance: "EDITORIAL",
        }),
        expect.objectContaining({
          targetEntityId: "eu:32013L0036:article:74",
          targetKind: "provision",
          role: "primary",
          provenance: "EDITORIAL",
        }),
      ]),
    );
    expect(context?.authorityRelationships).toHaveLength(2);
    expect(context?.authorityRelationships[0]).toMatchObject({
      relationType: "ISSUED_BY",
      provenance: "OFFICIAL_METADATA",
      reviewStatus: "reviewed",
    });
    expect(repository).toMatchObject({
      domainCount: 3,
      domainAssignmentCount: 10,
      authorityCount: 5,
      authorityRelationshipCount: 4,
    });
    expect(
      repository?.findDocumentRegulatoryContext(
        "eu:32013L0036",
        "eu:32013L0036:article:999",
      ),
    ).toBeNull();
    expect(repository?.findDocumentRegulatoryContext("eu:unknown")).toBeNull();
  });

  it("returns the reviewed EBA legal nature independently from Domain and issuer context", () => {
    const context = repository?.findDocumentRegulatoryContext(
      "eu:eba:gl:2021:05",
      "eu:eba:gl:2021:05:paragraph:5",
    );

    expect(context?.domainAssignments).toHaveLength(2);
    expect(context?.authorityRelationships).toContainEqual(
      expect.objectContaining({
        relationType: "ISSUED_BY",
        target: expect.objectContaining({
          id: "authority:eu:eba",
          acronym: "EBA",
        }),
      }),
    );
    expect(context?.legalNature).toMatchObject({
      instrumentType: "guideline",
      complianceExpectation: "make-every-effort-to-comply",
      currentStatus: "in-force",
      underReview: true,
      applicationDate: "2021-12-31",
      provenance: "OFFICIAL_METADATA",
    });
  });

  it("returns a bounded, normalized version chain only for reviewed status", () => {
    const chain = repository?.findDocumentVersionChain("eu:32024R2956");
    const crdChain = repository?.findDocumentVersionChain("eu:32013L0036");
    const crrChain = repository?.findDocumentVersionChain("eu:32013R0575");
    const crrThreeChain = repository?.findDocumentVersionChain("eu:32024R1623");
    const crdSixChain = repository?.findDocumentVersionChain("eu:32024L1619");
    const amldChain = repository?.findDocumentVersionChain("eu:32015L0849");
    const highRiskChain = repository?.findDocumentVersionChain("eu:32016R1675");
    const addedBankingChains = [
      "eu:32014L0049",
      "eu:32014L0059",
      "eu:32014R0806",
      "eu:32015L2366",
      "eu:32009L0110",
      "eu:32017R2402",
      "eu:32019L2162",
      "eu:32019R2160",
      "eu:31998L0026",
      "eu:32001L0024",
      "eu:32002L0047",
      "eu:32010R1093",
      "eu:32012R0648",
      "eu:32013R1024",
      "eu:32014L0065",
      "eu:32014R0600",
      "eu:32014R0909",
      "eu:32015R0751",
    ].map((documentId) => repository?.findDocumentVersionChain(documentId));
    const additionalConsolidatedChains = [
      "eu:32016R0679",
      "eu:32024R1689",
      "eu:32023R1114",
      "eu:32022L2555",
      "eu:32024R1774",
      "eu:32024R1620",
      "eu:32012R0260",
      "eu:32014L0017",
      "eu:32015R0061",
      "eu:32016R0101",
      "eu:32015R0063",
      "eu:32016R1075",
      "eu:32018R0389",
      "eu:32017R0565",
      "eu:32017R0587",
      "eu:32013R0149",
      "eu:32013R0153",
      "eu:32016R2251",
      "eu:32014R0241",
      "eu:32014R0183",
      "eu:32014R0529",
      "eu:32018R0345",
      "eu:32016R1401",
      "eu:32017R2055",
      "eu:32020R1423",
      "eu:32026R0825",
      "eu:32021R0923",
      "eu:32024R0856",
      "eu:32024R0857",
      "eu:32022R2579",
      "eu:32025R0791",
      "eu:32017R0747",
      "eu:32014R0468",
      "eu:32016R0445",
      "eu:32014R0527",
      "eu:32014R0530",
      "eu:32017R0180",
      "eu:32022R2580",
      "eu:32015R0081",
      "eu:32016R0451",
      "eu:32014R1163",
      "eu:32014R1151",
    ].map((documentId) => repository?.findDocumentVersionChain(documentId));

    expect(chain).toMatchObject({
      documentId: "eu:32024R2956",
      buildId: repository?.buildId,
      coverage: "source-status-only",
      checkedAt: "2026-09-29T00:00:00Z",
      loadedVersionId: "version:eu:32024R2956:consolidated:2024-12-02",
    });
    expect(chain?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "consolidated-snapshot",
          date: "2024-12-02",
          availability: "loaded",
        }),
        expect.objectContaining({
          kind: "current-version-link",
          sourceUrl: "https://eur-lex.europa.eu/eli/reg_impl/2024/2956",
          availability: "external",
        }),
        expect.objectContaining({
          kind: "corrigendum",
          date: "2025-09-19",
          availability: "external",
        }),
      ]),
    );
    expect(chain?.edges.map((edge) => edge.relationType)).toEqual([
      "CURRENT_VERSION_LINK",
      "HAS_CORRIGENDUM",
    ]);
    expect(crdChain).toMatchObject({
      documentId: "eu:32013L0036",
      coverage: "source-status-only",
      checkedAt: "2026-09-29T00:00:00Z",
      loadedVersionId: "version:eu:32013L0036:consolidated:2025-01-17",
    });
    expect(crdChain?.nodes).toHaveLength(4);
    expect(crdChain?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "current-version-link",
          availability: "external",
        }),
        expect.objectContaining({ kind: "corrigendum", date: "2013-08-02" }),
        expect.objectContaining({ kind: "corrigendum", date: "2017-01-25" }),
      ]),
    );
    expect(crdChain?.edges.map((edge) => edge.relationType)).toEqual([
      "CURRENT_VERSION_LINK",
      "HAS_CORRIGENDUM",
      "HAS_CORRIGENDUM",
    ]);
    expect(crrChain).toMatchObject({
      documentId: "eu:32013R0575",
      coverage: "source-status-only",
      checkedAt: "2026-09-28T00:00:00Z",
      loadedVersionId: "version:eu:32013R0575:consolidated:2026-06-26",
    });
    expect(crrChain?.nodes).toHaveLength(2);
    expect(crrChain?.nodes[0]).toMatchObject({ kind: "consolidated-snapshot" });
    expect(crrChain?.edges.map((edge) => edge.relationType)).toEqual([
      "CURRENT_VERSION_LINK",
    ]);
    expect(crrThreeChain).toMatchObject({
      documentId: "eu:32024R1623",
      loadedVersionId: "version:eu:32024R1623:original-oj:2024-06-19",
    });
    expect(crrThreeChain?.nodes).toHaveLength(3);
    expect(crrThreeChain?.edges.map((edge) => edge.relationType)).toEqual([
      "CURRENT_VERSION_LINK",
      "HAS_CORRIGENDUM",
    ]);
    expect(crdSixChain).toMatchObject({
      documentId: "eu:32024L1619",
      loadedVersionId: "version:eu:32024L1619:original-oj:2024-06-19",
    });
    expect(crdSixChain?.nodes).toHaveLength(2);
    expect(crdSixChain?.edges.map((edge) => edge.relationType)).toEqual([
      "CURRENT_VERSION_LINK",
    ]);
    expect(amldChain).toMatchObject({
      documentId: "eu:32015L0849",
      coverage: "source-status-only",
      loadedVersionId: "version:eu:32015L0849:consolidated:2024-12-30",
      nodes: [
        expect.objectContaining({ kind: "consolidated-snapshot" }),
        expect.objectContaining({
          kind: "current-version-link",
          sourceUrl: "https://eur-lex.europa.eu/eli/dir/2015/849",
        }),
      ],
    });
    expect(highRiskChain).toMatchObject({
      documentId: "eu:32016R1675",
      coverage: "source-status-only",
      loadedVersionId: "version:eu:32016R1675:consolidated:2026-01-29",
    });
    expect(
      addedBankingChains.every(
        (bankingChain) =>
          bankingChain?.nodes.length === 2 && bankingChain.edges.length === 1,
      ),
    ).toBe(true);
    expect(repository?.findDocumentVersionChain(dora.id)).toBeNull();
    expect(repository?.findDocumentVersionChain("eu:unknown")).toBeNull();
    expect(repository?.versionNodeCount).toBe(
      (chain?.nodes.length ?? 0) +
        (crdChain?.nodes.length ?? 0) +
        (crrChain?.nodes.length ?? 0) +
        (crrThreeChain?.nodes.length ?? 0) +
        (crdSixChain?.nodes.length ?? 0) +
        (amldChain?.nodes.length ?? 0) +
        (highRiskChain?.nodes.length ?? 0) +
        addedBankingChains.reduce(
          (sum, bankingChain) => sum + (bankingChain?.nodes.length ?? 0),
          0,
        ) +
        additionalConsolidatedChains.reduce(
          (sum, consolidatedChain) =>
            sum + (consolidatedChain?.nodes.length ?? 0),
          0,
        ),
    );
    expect(repository?.versionEdgeCount).toBe(
      (chain?.edges.length ?? 0) +
        (crdChain?.edges.length ?? 0) +
        (crrChain?.edges.length ?? 0) +
        (crrThreeChain?.edges.length ?? 0) +
        (crdSixChain?.edges.length ?? 0) +
        (amldChain?.edges.length ?? 0) +
        (highRiskChain?.edges.length ?? 0) +
        addedBankingChains.reduce(
          (sum, bankingChain) => sum + (bankingChain?.edges.length ?? 0),
          0,
        ) +
        additionalConsolidatedChains.reduce(
          (sum, consolidatedChain) =>
            sum + (consolidatedChain?.edges.length ?? 0),
          0,
        ),
    );
  });

  it("returns explicit references and derives cited-by without duplicate edges", () => {
    const doraArticleOne = repository?.findProvisionRelationships(
      "eu:32022R2554",
      "eu:32022R2554:article:1",
    );
    expect(doraArticleOne?.references).toContainEqual(
      expect.objectContaining({
        relationType: "REFERENCES",
        provenance: "LEGAL_TEXT",
        source: expect.objectContaining({
          provisionId: "eu:32022R2554:article:1",
        }),
        target: expect.objectContaining({
          entityId: "eu:32022L2555:article:3",
          path: "/read/nis2/articles/3",
        }),
        evidence: expect.objectContaining({
          text: "Article 3 of Directive (EU) 2022/2555",
        }),
      }),
    );

    const nisArticleThree = repository?.findProvisionRelationships(
      "eu:32022L2555",
      "eu:32022L2555:article:3",
    );
    expect(nisArticleThree?.citedBy).toContainEqual(
      expect.objectContaining({
        relationType: "CITED_BY",
        source: expect.objectContaining({
          documentShortName: "DORA",
          provisionId: "eu:32022R2554:article:1",
        }),
      }),
    );
    expect(repository?.relationshipCount).toBeGreaterThan(1_000);
    expect(repository?.cellarRelationshipCount).toBe(12);
    expect(repository?.unresolvedReferenceCount).toBeGreaterThan(0);
  });

  it("returns null when a relationship query uses an unknown provision", () => {
    expect(
      repository?.findProvisionRelationships(
        "eu:32022R2554",
        "eu:32022R2554:article:999",
      ),
    ).toBeNull();
  });

  it("keeps reviewed lifecycle edges separate from loaded legal entities", () => {
    const doraLifecycle =
      repository?.findDocumentLifecycleRelationships("eu:32022R2554");

    expect(doraLifecycle?.relationships).toHaveLength(14);
    expect(doraLifecycle?.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "AMENDS",
          provenance: "OFFICIAL_METADATA",
          source: expect.objectContaining({
            entityId: "eu:32022R2554",
            kind: "document",
            availability: "loaded",
            path: "/read/dora/articles/1",
          }),
          target: expect.objectContaining({
            entityId: "eu:32009R1060",
            celex: "32009R1060",
            kind: "external-work",
            availability: "external",
          }),
          builder: { method: "cellar-lifecycle", version: "1.0.0" },
          resolutionStatus: "external",
        }),
        expect.objectContaining({
          relationType: "CORRECTS",
          target: expect.objectContaining({
            entityId: "eu:32022R2554",
            kind: "document",
          }),
          source: expect.objectContaining({
            kind: "external-work",
            title: null,
          }),
        }),
      ]),
    );
    expect(
      doraLifecycle?.relationships.every(
        (relationship) =>
          relationship.source.documentId === "eu:32022R2554" ||
          relationship.target.documentId === "eu:32022R2554",
      ),
    ).toBe(true);
    expect(repository?.lifecycleRelationshipCount).toBe(67);
    expect(repository?.externalWorkCount).toBe(59);
    expect(
      repository?.findDocumentLifecycleRelationships("eu:unknown"),
    ).toBeNull();
  });

  it("returns reviewed CJEU Work-level metadata without claiming Article citations", () => {
    const gdprCases =
      repository?.findDocumentCaseLawRelationships("eu:32016R0679");

    expect(gdprCases?.relationships).toHaveLength(72);
    expect(gdprCases?.relationships).toContainEqual(
      expect.objectContaining({
        relationType: "INTERPRETS",
        provenance: "OFFICIAL_METADATA",
        source: expect.objectContaining({
          entityId: "case:eu:62017CJ0496",
          caseNumber: "Case C-496/17.",
          ecli: "ECLI:EU:C:2019:26",
          decisionType: "judgment",
          availability: "metadata-only",
        }),
        target: expect.objectContaining({
          documentId: "eu:32016R0679",
          kind: "document",
          availability: "loaded",
        }),
        resolutionStatus: "metadata-only",
      }),
    );
    expect(
      repository?.findDocumentCaseLawRelationships("eu:32022R2554")
        ?.relationships,
    ).toEqual([]);
    expect(
      repository?.findDocumentCaseLawRelationships("eu:unknown"),
    ).toBeNull();
    expect(repository?.caseCount).toBe(72);
    expect(repository?.caseLawRelationshipCount).toBe(72);
  });

  it("returns benchmark-gated TF-IDF related recitals with similarity scores", () => {
    const doraArticleTwenty = repository?.findProvisionRelationships(
      "eu:32022R2554",
      "eu:32022R2554:article:20",
    );

    expect(doraArticleTwenty?.relatedRecitals).toContainEqual(
      expect.objectContaining({
        relationType: "RELATED_RECITAL",
        provenance: "TFIDF",
        target: expect.objectContaining({
          entityId: "eu:32022R2554:recital:53",
        }),
        builder: {
          method: "tfidf-related-recital",
          version: "1.0.0",
        },
        score: expect.any(Number),
      }),
    );
    expect(repository?.relatedRecitalCount).toBeGreaterThan(300);
  });

  it("returns reviewed Level 2 mappings in both legal directions", () => {
    const doraMandate = repository?.findProvisionRelationships(
      "eu:32022R2554",
      "eu:32022R2554:article:15",
    );
    expect(doraMandate?.mandates).toContainEqual(
      expect.objectContaining({
        relationType: "MANDATES",
        provenance: "OFFICIAL_MAPPING",
        target: expect.objectContaining({
          entityId: "eu:32024R1774",
          documentShortName: "DORA RTS ICT Risk Management",
        }),
      }),
    );

    const doraRts = repository?.findProvisionRelationships(
      "eu:32024R1774",
      "eu:32024R1774:article:1",
    );
    expect(doraRts?.adoptedUnder).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "ADOPTED_UNDER",
          provenance: "OFFICIAL_MAPPING",
          target: expect.objectContaining({
            entityId: "eu:32022R2554:article:15",
          }),
        }),
        expect.objectContaining({
          target: expect.objectContaining({
            entityId: "eu:32022R2554:article:16",
          }),
        }),
      ]),
    );
    expect(doraRts?.adoptedUnder).toContainEqual(
      expect.objectContaining({
        relationType: "ADOPTED_UNDER",
        provenance: "OFFICIAL_METADATA",
        target: expect.objectContaining({
          entityId: "eu:32022R2554",
        }),
        evidence: expect.objectContaining({
          text: "Legal resource is based on legal resource",
        }),
        builder: {
          method: "cellar-focused-relations",
          version: "1.0.0",
        },
      }),
    );
    expect(doraRts?.supplements).toContainEqual(
      expect.objectContaining({
        relationType: "SUPPLEMENTS",
        provenance: "OFFICIAL_METADATA",
        target: expect.objectContaining({
          entityId: "eu:32022R2554",
        }),
      }),
    );

    const cssfImplementation = repository?.findProvisionRelationships(
      "lu:cssf:circular-12-552",
      "lu:cssf:circular-12-552:provision:introduction",
    );
    expect(cssfImplementation?.implements).toEqual([
      expect.objectContaining({
        relationType: "IMPLEMENTS",
        provenance: "OFFICIAL_MAPPING",
        source: expect.objectContaining({
          entityId: "lu:cssf:circular-12-552:provision:introduction:block:7",
        }),
        target: expect.objectContaining({
          entityId: "eu:eba:gl:2021:05",
          documentShortName: "EBA/GL/2021/05",
        }),
        builder: {
          method: "national-implementation",
          version: "1.0.0",
        },
      }),
    ]);
    expect(
      repository
        ?.findDocumentRelationships("lu:cssf:circular-12-552")
        ?.relationships.some(
          (relationship) => relationship.relationType === "IMPLEMENTS",
        ),
    ).toBe(true);

    const micaMandate = repository?.findProvisionRelationships(
      "eu:32023R1114",
      "eu:32023R1114:article:62",
    );
    expect(micaMandate?.mandates).toContainEqual(
      expect.objectContaining({
        target: expect.objectContaining({ entityId: "eu:32025R0305" }),
      }),
    );

    const incidentReportingMandates = repository?.findProvisionRelationships(
      "eu:32022R2554",
      "eu:32022R2554:article:20",
    );
    expect(incidentReportingMandates?.mandates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({ entityId: "eu:32025R0301" }),
        }),
        expect.objectContaining({
          target: expect.objectContaining({ entityId: "eu:32025R0302" }),
        }),
      ]),
    );
    expect(
      repository?.findProvisionRelationships(
        "eu:32025R0302",
        "eu:32025R0302:article:1",
      )?.adoptedUnder,
    ).toContainEqual(
      expect.objectContaining({
        target: expect.objectContaining({
          entityId: "eu:32022R2554:article:20",
        }),
      }),
    );
  });

  it("lists Level 2 measures from SQLite with counts and mandate Articles", () => {
    expect(repository?.findDocument("eu:32024R2956")).toMatchObject({
      buildId: expect.stringContaining("status-"),
      sourceStatus: {
        basis: "consolidated",
        textAsOf: "2024-12-02",
        checkedAt: "2026-09-29T00:00:00Z",
        currentVersionUrl: "https://eur-lex.europa.eu/eli/reg_impl/2024/2956",
        corrections: [expect.objectContaining({ date: "2025-09-19" })],
      },
    });
    const dora = repository?.findFamilyLevel2("family:dora");
    expect(dora).toMatchObject({
      familyId: "family:dora",
      familyShortName: "DORA",
      counts: { rts: 8, its: 2, guidelines: 0 },
    });
    expect(dora?.measures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "eu:32024R1774",
          measureType: "rts",
          celex: "32024R1774",
          mandates: expect.arrayContaining([
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:15",
              path: "/read/dora/articles/15",
            }),
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:16",
            }),
          ]),
        }),
        expect.objectContaining({
          id: "eu:32024R1773",
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:28",
              path: "/read/dora/articles/28",
            }),
          ],
        }),
        expect.objectContaining({
          id: "eu:32024R1772",
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:18",
              path: "/read/dora/articles/18",
            }),
          ],
        }),
        expect.objectContaining({
          id: "eu:32024R2956",
          measureType: "its",
          sourceStatus: expect.objectContaining({
            basis: "consolidated",
            corrections: [expect.objectContaining({ date: "2025-09-19" })],
          }),
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:28",
            }),
          ],
        }),
        expect.objectContaining({
          id: "eu:32025R0301",
          measureType: "rts",
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:20",
            }),
          ],
        }),
        expect.objectContaining({
          id: "eu:32025R0302",
          measureType: "its",
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:20",
            }),
          ],
        }),
        expect.objectContaining({
          id: "eu:32025R0532",
          measureType: "rts",
          mandates: [],
        }),
      ]),
    );
    expect(repository?.findFamilyLevel2("family:mica", "rts")).toMatchObject({
      counts: { rts: 1, its: 0, guidelines: 0 },
      measures: [
        expect.objectContaining({
          id: "eu:32025R0305",
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32023R1114:article:62",
            }),
          ],
        }),
      ],
    });
    expect(repository?.findFamilyLevel2("family:gdpr")).toMatchObject({
      measures: [],
    });
    expect(repository?.findFamilyLevel2("family:unknown")).toBeNull();
  });

  it("returns a short on-demand preview without adding legal text to relation rows", () => {
    expect(
      repository?.findRelationshipPreview("eu:32022L2555:article:3"),
    ).toMatchObject({
      entityId: "eu:32022L2555:article:3",
      documentShortName: "NIS2",
      label: "Article 3",
      path: "/read/nis2/articles/3",
      excerpt: expect.any(String),
    });
    expect(repository?.findRelationshipPreview("eu:unknown")).toBeNull();
  });

  it("keeps Dossiers queryable as a separate source-backed product", () => {
    expect(repository?.listRegulatoryDossiers()).toHaveLength(3);
    expect(
      repository?.findRegulatoryDossier("major-ict-incident-reporting"),
    ).toMatchObject({
      id: "dossier:major-ict-incident-reporting",
      provenance: "EDITORIAL",
      reviewStatus: "reviewed",
      sections: expect.arrayContaining([
        expect.objectContaining({
          id: "section:event-boundary",
          sourceIds: expect.arrayContaining(["source:qa-2025-7613"]),
        }),
      ]),
      sources: expect.arrayContaining([
        expect.objectContaining({
          targetId: "qa:eba:2025_7613",
          provenance: "OFFICIAL_QA",
          targetPath: "/qa/eba/2025_7613",
        }),
      ]),
    });
    expect(repository?.listDossiersForQa("qa:eba:2025_7613")).toEqual([
      expect.objectContaining({ slug: "major-ict-incident-reporting" }),
    ]);
    expect(repository?.findRegulatoryDossier("not-found")).toBeNull();
  });
});
