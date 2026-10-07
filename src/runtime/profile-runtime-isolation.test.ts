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
      profileVersion: "1.6.0",
    });
    expect(search).toMatchObject({
      profileId: "banking-default",
      profileHash: repository?.profileHash,
      documentCount: 95,
    });
  });

  it("includes the AML, CRD, and CRR sources across Reader and Search", () => {
    expect(repository?.findDocumentBySlug("amld-iv")?.id).toBe("eu:32015L0849");
    expect(
      search
        ?.search("obliged entities customer due diligence")
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
