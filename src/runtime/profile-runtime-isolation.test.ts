import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CitationContextService } from "../agent/citation-context-service";
import { CitationRetrievalService } from "../agent/citation-retrieval-service";
import { loadDocumentViews } from "../data/document-repository";
import { loadCssfSourceRegistrySync } from "../ingestion/cssf-source-registry";
import { loadEbaSourceRegistrySync } from "../ingestion/eba-source-registry";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import { RegulatoryPathService } from "../paths/regulatory-path-service";
import { PublicApiService } from "../public-api/public-api-service";
import { toGlobalRelationshipGraph } from "../relationships/relationship-graph";
import { SearchService } from "../search/full-text-search";
import { createLawSearchRecords, searchLaws } from "../search/law-search";
import { buildRuntimeDatabase } from "../search/sqlite-search-index";
import { RegulatoryTopicService } from "../topics/regulatory-topic-service";
import {
  findEditionProfile,
  loadEditionProfileRegistrySync,
} from "./edition-profile";
import { SqliteRuntimeRepository } from "./sqlite-runtime-repository";

const testDirectory = mkdtempSync(join(tmpdir(), "regulatory-profile-"));
const databasePath = join(testDirectory, "banking.sqlite");
let repository: SqliteRuntimeRepository | undefined;
let search: SearchService | undefined;
let citationContext: CitationContextService | undefined;
let citationRetrieval: CitationRetrievalService | undefined;
let regulatoryPaths: RegulatoryPathService | undefined;
let regulatoryTopics: RegulatoryTopicService | undefined;
let publicApi: PublicApiService | undefined;

beforeAll(() => {
  const profile = findEditionProfile(
    "banking-default",
    loadEditionProfileRegistrySync(),
  );
  buildRuntimeDatabase(
    loadDocumentViews(),
    [
      ...loadSourceRegistrySync(),
      ...loadCssfSourceRegistrySync(),
      ...loadEbaSourceRegistrySync(),
    ],
    databasePath,
    profile,
  );
  repository = new SqliteRuntimeRepository(databasePath);
  search = new SearchService(databasePath);
  citationContext = new CitationContextService(repository);
  citationRetrieval = new CitationRetrievalService(search, citationContext);
  regulatoryPaths = new RegulatoryPathService(repository);
  regulatoryTopics = new RegulatoryTopicService(repository);
  publicApi = new PublicApiService(
    repository,
    createLawSearchRecords(
      repository.listDocumentViews(),
      repository.listLawSearchSources(),
    ),
    citationContext,
  );
});

afterAll(() => {
  repository?.close();
  search?.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("banking-default runtime isolation", () => {
  it("reports one Profile identity across Reader and Search services", () => {
    expect(repository).toMatchObject({
      profileId: "banking-default",
      profileVersion: "1.10.0",
    });
    expect(search).toMatchObject({
      profileId: "banking-default",
      profileHash: repository?.profileHash,
      documentCount: 57,
    });
  });

  it("includes post-trade laws and AI implementing measures with exact source identity", () => {
    for (const [
      celex,
      articles,
      recitals,
      annexes,
      query,
      basis,
      date,
      article,
    ] of [
      [
        "32012R0648",
        137,
        0,
        4,
        "trade repositories",
        "consolidated",
        "2025-01-17",
        "9",
      ],
      [
        "32014R0909",
        83,
        0,
        1,
        "settlement internalisers",
        "consolidated",
        "2026-01-17",
        "5",
      ],
      [
        "32025R0454",
        20,
        13,
        0,
        "scientific panel",
        "original-oj",
        "2025-03-10",
        "5",
      ],
      [
        "32026R1755",
        15,
        6,
        1,
        "general-purpose AI models",
        "original-oj",
        "2026-07-21",
        "5",
      ],
    ] as const) {
      const documentId = `eu:${celex}`;
      const document = repository?.findDocument(documentId);
      expect(document?.id).toBe(documentId);
      for (const [kind, count] of [
        ["article", articles],
        ["recital", recitals],
        ["annex", annexes],
      ] as const) {
        expect(
          document?.provisions.filter((item) => item.kind === kind),
        ).toHaveLength(count);
      }
      for (const options of [{ documentId }, {}]) {
        expect(
          search
            ?.search(query, options)
            .results.some((item) => item.documentId === documentId),
        ).toBe(true);
      }
      expect(
        citationContext?.findByEntityId(
          `${documentId}:article:${article}:paragraph:1`,
        ),
      ).not.toBeNull();
      expect(repository?.findDocumentVersionChain(documentId)).toMatchObject({
        loadedVersionId: `version:${documentId}:${basis}:${date}`,
      });
    }
    for (const [celex, id] of [
      ["32012R0648", "relationship:3a89335d6477cbfac49ee462"],
      ["32014R0909", "relationship:8fb413b27fb27de3bbae9271"],
    ] as const) {
      expect(
        repository?.findDocumentLifecycleRelationships(`eu:${celex}`)
          ?.relationships,
      ).toContainEqual(
        expect.objectContaining({
          id,
          relationType: "AMENDS",
          source: expect.objectContaining({
            entityId: "eu:32022R2554",
            availability: "loaded",
          }),
          target: expect.objectContaining({
            entityId: `eu:${celex}`,
            kind: "document",
            availability: "loaded",
          }),
          resolutionStatus: "resolved",
        }),
      );
    }
  });

  it("includes investment services and transaction-reporting provisions with reviewed DORA linkage", () => {
    for (const [celex, count, annexes, query, date, article, paragraph] of [
      ["32014L0065", 103, 4, "investment advice", "2026-06-06", "25", "2"],
      ["32014R0600", 95, 0, "transaction report", "2025-11-23", "26", "1"],
    ] as const) {
      const documentId = `eu:${celex}`;
      const document = repository?.findDocument(documentId);
      expect(document?.id).toBe(documentId);
      expect(
        document?.provisions.filter((item) => item.kind === "article"),
      ).toHaveLength(count);
      expect(
        document?.provisions.filter((item) => item.kind === "annex"),
      ).toHaveLength(annexes);
      expect(
        search
          ?.search(query, { documentId })
          .results.some((item) => item.documentId === documentId),
      ).toBe(true);
      expect(
        search
          ?.search(query)
          .results.some((item) => item.documentId === documentId),
      ).toBe(true);
      expect(
        citationContext?.findByEntityId(
          `${documentId}:article:${article}:paragraph:${paragraph}`,
        ),
      ).not.toBeNull();
      expect(repository?.findDocumentVersionChain(documentId)).toMatchObject({
        loadedVersionId: `version:${documentId}:consolidated:${date}`,
      });
    }
    expect(
      repository?.findDocumentLifecycleRelationships("eu:32014R0600")
        ?.relationships,
    ).toContainEqual(
      expect.objectContaining({
        id: "relationship:c6ffdeffb82af57894b0da07",
        relationType: "AMENDS",
        source: expect.objectContaining({
          entityId: "eu:32022R2554",
          availability: "loaded",
        }),
        target: expect.objectContaining({
          entityId: "eu:32014R0600",
          kind: "document",
          availability: "loaded",
        }),
        resolutionStatus: "resolved",
      }),
    );
    expect(
      search
        ?.search("operational risk")
        .results.some((item) => item.documentId === "eu:32022R2554"),
    ).toBe(true);
  });

  it("includes EBA and bank winding-up consolidated text while excluding MiCA lifecycle edges", () => {
    for (const [celex, count, recitals, query, date, lastArticle] of [
      ["32010R1093", 100, 0, "European Banking Authority", "2025-12-31", "82"],
      ["32001L0024", 36, 32, "winding-up", "2014-07-02", "36"],
    ] as const) {
      const documentId = `eu:${celex}`;
      const document = repository?.findDocument(documentId);
      expect(document?.id).toBe(documentId);
      expect(
        document?.provisions.filter((item) => item.kind === "article"),
      ).toHaveLength(count);
      expect(
        document?.provisions.filter((item) => item.kind === "recital"),
      ).toHaveLength(recitals);
      expect(
        search
          ?.search(query, { documentId })
          .results.some((item) => item.documentId === documentId),
      ).toBe(true);
      for (const article of ["1", lastArticle]) {
        expect(
          citationContext?.findByEntityId(`${documentId}:article:${article}`),
        ).not.toBeNull();
      }
      expect(repository?.findDocumentVersionChain(documentId)).toMatchObject({
        loadedVersionId: `version:${documentId}:consolidated:${date}`,
      });
    }
    const ebaLifecycle =
      repository?.findDocumentLifecycleRelationships("eu:32010R1093");
    expect(ebaLifecycle).toBeNull();
    expect(
      JSON.stringify(repository?.listLifecycleRelationships()),
    ).not.toContain("32023R1114");
  });

  it("includes supervision and interchange-fee sources with original publication identity", () => {
    for (const [celex, count, recitals, query, date, article] of [
      ["32013R1024", 34, 87, "prudential supervision", "2013-10-29", "4"],
      ["32015R0751", 18, 44, "interchange fees", "2015-05-19", "3"],
    ] as const) {
      const documentId = `eu:${celex}`;
      const document = repository?.findDocument(documentId);
      expect(document?.id).toBe(documentId);
      expect(
        document?.provisions.filter(
          (provision) => provision.kind === "article",
        ),
      ).toHaveLength(count);
      expect(
        document?.provisions.filter(
          (provision) => provision.kind === "recital",
        ),
      ).toHaveLength(recitals);
      expect(
        search
          ?.search(query, { documentId })
          .results.some((result) => result.documentId === documentId),
      ).toBe(true);
      expect(
        citationContext?.findByEntityId(`${documentId}:article:${article}`),
      ).not.toBeNull();
      expect(repository?.findDocumentVersionChain(documentId)).toMatchObject({
        loadedVersionId: `version:${documentId}:original-oj:${date}`,
      });
    }
  });

  it("includes collateral and settlement sources with consolidated IDs, search, and citations", () => {
    for (const [celex, count, query, date, insertedArticles] of [
      ["32002L0047", 14, "financial collateral", "2022-08-12", ["9a"]],
      ["31998L0026", 16, "settlement", "2024-04-08", ["10a", "12a"]],
    ] as const) {
      const documentId = `eu:${celex}`;
      const document = repository?.findDocument(documentId);
      expect(document?.id).toBe(documentId);
      expect(
        document?.provisions.filter(
          (provision) => provision.kind === "article",
        ),
      ).toHaveLength(count);
      expect(
        search
          ?.search(query, { documentId })
          .results.some((result) => result.documentId === documentId),
      ).toBe(true);
      for (const article of ["1", ...insertedArticles]) {
        expect(
          citationContext?.findByEntityId(`${documentId}:article:${article}`),
        ).not.toBeNull();
      }
      expect(repository?.findDocumentVersionChain(documentId)).toMatchObject({
        loadedVersionId: `version:${documentId}:consolidated:${date}`,
      });
    }
  });

  it("includes banking-core-3 exact provisions and search without merging quoted amendment articles", () => {
    for (const [celex, articleCount, query] of [
      ["32009L0110", 24, "electronic money"],
      ["32017R2402", 55, "securitisation"],
      ["32019L2162", 35, "covered bonds"],
      ["32019R2160", 2, "covered bonds"],
    ] as const) {
      const documentId = `eu:${celex}`;
      const document = repository?.findDocument(documentId);
      expect(document?.id).toBe(documentId);
      expect(
        document?.provisions.filter(
          (provision) => provision.kind === "article",
        ),
      ).toHaveLength(articleCount);
      expect(
        search
          ?.search(query, { documentId })
          .results.some((result) => result.documentId === documentId),
      ).toBe(true);
      expect(
        citationContext?.findByEntityId(`${documentId}:article:1`),
      ).not.toBeNull();
    }
    for (const article of ["26a", "26b", "26c", "26d", "26e", "43a", "45a"]) {
      expect(
        citationContext?.findByEntityId(`eu:32017R2402:article:${article}`),
      ).not.toBeNull();
    }
    expect(
      citationContext?.findByEntityId("eu:32019L2162:article:26a"),
    ).not.toBeNull();
    expect(
      citationContext?.findByEntityId("eu:32017R2402:article:50a"),
    ).toBeNull();
  });

  it("includes the AML, CRD, and CRR sources across Reader and Search", () => {
    expect(repository?.findDocumentBySlug("amld-iv")?.id).toBe("eu:32015L0849");
    expect(
      search
        ?.search("money laundering", { documentId: "eu:32015L0849" })
        .results.some((result) => result.documentId === "eu:32015L0849"),
    ).toBe(true);
    expect(
      search
        ?.search("money laundering")
        .results.some((result) => result.documentId === "eu:32015L0849"),
    ).toBe(true);
    expect(repository?.findDocumentBySlug("crd-iv")?.id).toBe("eu:32013L0036");
    expect(
      search
        ?.search("internal governance")
        .results.some((result) => result.documentId === "eu:32013L0036"),
    ).toBe(true);
    expect(
      search?.listDocumentDefinitions("eu:32013L0036")?.definitions,
    ).toHaveLength(74);
    expect(repository?.findDocumentBySlug("crr")?.id).toBe("eu:32013R0575");
    expect(repository?.findDocumentBySlug("crr-iii")?.id).toBe("eu:32024R1623");
    expect(repository?.findDocumentBySlug("crd-vi")?.id).toBe("eu:32024L1619");
    expect(
      search
        ?.search("own funds requirements")
        .results.some((result) => result.documentId === "eu:32013R0575"),
    ).toBe(true);
    expect(
      repository?.findDocumentRegulatoryContext(
        "eu:32013L0036",
        "eu:32013L0036:article:74",
      )?.domainAssignments,
    ).toHaveLength(2);
    expect(
      repository?.findProvisionRelationships(
        "lu:cssf:circular-12-552",
        "lu:cssf:circular-12-552:provision:introduction",
      )?.implements,
    ).toEqual([
      expect.objectContaining({
        relationType: "IMPLEMENTS",
        target: expect.objectContaining({ entityId: "eu:eba:gl:2021:05" }),
      }),
    ]);
    expect(
      citationContext?.findByEntityId(
        "lu:cssf:circular-12-552:provision:introduction:block:7",
      ),
    ).toMatchObject({
      runtime: { profileId: "banking-default" },
      document: { id: "lu:cssf:circular-12-552" },
    });
    expect(
      repository?.findDocumentSupervisoryDecisions(
        "eu:32016R0679",
        "eu:32016R0679:article:6",
      ),
    ).toMatchObject({
      runtime: { profileId: "banking-default" },
      decisions: [
        {
          id: "decision:lu:cnpd:18fr-2022",
          findings: [{ target: { entityId: "eu:32016R0679:article:6" } }],
        },
      ],
    });
    expect(
      repository?.findImplementationTimelineBySlug("ai-act"),
    ).toMatchObject({
      runtime: { profileId: "banking-default" },
      events: expect.arrayContaining([
        expect.objectContaining({ date: "2026-08-02" }),
      ]),
    });
    expect(repository?.findApplicabilityBySlug("dora")).toMatchObject({
      runtime: { profileId: "banking-default" },
      entityType: { id: "credit-institution" },
      guardrails: { finalLegalDetermination: false },
    });
    expect(
      regulatoryPaths?.findByDomainSlug("banking-governance-internal-control"),
    ).toMatchObject({
      runtime: { profileId: "banking-default" },
      scope: { applicabilityConclusion: false },
      relationships: expect.arrayContaining([
        expect.objectContaining({ relationType: "MANDATES" }),
        expect.objectContaining({ relationType: "IMPLEMENTS" }),
      ]),
    });
    expect(regulatoryTopics?.list()).toMatchObject({
      runtime: { profileId: "banking-default" },
      topics: expect.arrayContaining([
        expect.objectContaining({ id: "topic:ict-third-party-risk" }),
        expect.objectContaining({
          id: "topic:banking-governance-internal-control",
        }),
      ]),
    });
    expect(
      regulatoryTopics?.findBySlug("banking-governance-internal-control"),
    ).toMatchObject({
      scope: { applicabilityConclusion: false },
      documents: expect.arrayContaining([
        expect.objectContaining({ id: "eu:32013L0036" }),
        expect.objectContaining({ id: "eu:eba:gl:2021:05" }),
        expect.objectContaining({ id: "lu:cssf:circular-12-552" }),
      ]),
    });
  });

  it("makes excluded Reader, Explorer, Library, and relationship lookups unavailable", () => {
    expect(repository?.findDocument("eu:32023R1114")).toBeNull();
    expect(repository?.findDocumentBySlug("mica")).toBeNull();
    expect(repository?.findExplorerBySlug("mica")).toBeNull();
    expect(repository?.findFamilyLevel2("family:mica")).toBeNull();
    expect(
      repository?.findProvisionRelationships(
        "eu:32023R1114",
        "eu:32023R1114:article:62",
      ),
    ).toBeNull();
    expect(
      repository?.findRelationshipPreview("eu:32023R1114:article:62"),
    ).toBeNull();
    expect(search?.listDocumentDefinitions("eu:32023R1114")).toBeNull();
    expect(
      repository?.findDocumentRegulatoryContext("eu:32023R1114"),
    ).toBeNull();
    expect(
      citationContext?.findByEntityId("eu:32023R1114:article:62"),
    ).toBeNull();
    expect(
      citationRetrieval?.search("crypto-assets", {
        documentId: "eu:32023R1114",
      }).results,
    ).toEqual([]);
    expect(publicApi?.resolveLaw("MiCA")).toMatchObject({
      ok: true,
      response: { data: { resultCount: 0, bestMatch: null, results: [] } },
    });
    expect(publicApi?.getLawStructure("eu:32023R1114")).toMatchObject({
      ok: false,
      status: 404,
      response: { error: { code: "LAW_NOT_FOUND" } },
    });
    expect(publicApi?.discover("full-corpus")).toMatchObject({
      ok: false,
      status: 403,
      response: { error: { code: "PROFILE_NOT_AVAILABLE" } },
    });
  });

  it("does not leak excluded documents through search or graph projections", () => {
    const lawSearch = repository
      ? searchLaws(
          createLawSearchRecords(
            repository.listDocumentViews(),
            repository.listLawSearchSources(),
          ),
          "MiCA",
        )
      : null;
    const fullText = search?.search("crypto-assets");
    const definitions = search?.searchDefinitions("crypto-asset");
    const graph = repository
      ? toGlobalRelationshipGraph(
          repository.listDocumentViews(),
          repository.listCrossDocumentRelationships(),
          repository.listLifecycleRelationships(),
          repository.listCaseLawRelationships(),
          repository.buildId,
        )
      : null;

    for (const payload of [lawSearch, fullText, definitions, graph]) {
      expect(JSON.stringify(payload)).not.toContain("eu:32023R1114");
      expect(JSON.stringify(payload)).not.toContain("eu:32025R0305");
    }
    expect(JSON.stringify(graph)).not.toContain("CELEX 32023R1114");
    expect(JSON.stringify(graph)).not.toContain("CELEX 32025R0305");
  });
});
