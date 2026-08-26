import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { SearchService } from "../search/full-text-search";
import { CitationContextService } from "./citation-context-service";
import {
  evaluateCitationRetrieval,
  loadCitationRetrievalBenchmark,
} from "./citation-retrieval-benchmark";
import {
  CitationRetrievalService,
  type CitationSearchService,
} from "./citation-retrieval-service";

let repository: SqliteRuntimeRepository | undefined;
let search: SearchService | undefined;
let context: CitationContextService | undefined;
let retrieval: CitationRetrievalService | undefined;

beforeAll(() => {
  repository = new SqliteRuntimeRepository();
  search = new SearchService();
  context = new CitationContextService(repository);
  retrieval = new CitationRetrievalService(search, context);
});

afterAll(() => {
  search?.close();
  repository?.close();
});

describe("citation retrieval service", () => {
  it("returns ranked citation bundles over exact Runtime entities", () => {
    const result = retrieval?.search(
      "translating them proportionate Luxembourg banking sector",
      { limit: 3 },
    );

    expect(result).toMatchObject({
      schemaVersion: "1.0.0",
      runtime: { profileId: "full-corpus" },
      retrieval: {
        method: "fts5-to-citation-context",
        version: "1.0.0",
        requestedLimit: 3,
        resultCount: 1,
      },
      results: [
        {
          rank: 1,
          searchRank: 1,
          searchRecordId:
            "lu:cssf:circular-12-552:provision:introduction:block:7",
          resolvedEntityId:
            "lu:cssf:circular-12-552:provision:introduction:block:7",
          resolution: "exact-search-entity",
        },
      ],
    });
    expect(result?.results[0]?.context).toMatchObject({
      document: { sourceSnapshotId: expect.stringMatching(/^snapshot:cssf:/u) },
      target: { sourceLocator: { kind: "pdf-page", value: "2" } },
    });
  });

  it("returns an empty, identity-bearing response for no lexical match", () => {
    expect(retrieval?.search("nonexistentregulatoryphrase")).toMatchObject({
      normalizedQuery: "nonexistentregulatoryphrase",
      runtime: { buildId: repository?.buildId },
      retrieval: { resultCount: 0 },
      results: [],
    });
  });

  it("falls back only to the search record's own root Provision", () => {
    if (!search || !context) throw new Error("Citation services unavailable");
    const fallbackSearch: CitationSearchService = {
      buildId: search.buildId,
      profileId: search.profileId,
      profileHash: search.profileHash,
      search: (query) => ({
        query,
        normalizedQuery: query.toLowerCase(),
        indexBuildId: search?.buildId ?? "missing",
        results: [
          {
            id: "unindexed-search-record",
            documentId: "eu:32013L0036",
            slug: "crd-iv",
            shortName: "CRD IV",
            celex: "32013L0036",
            provisionId: "eu:32013L0036:article:74",
            kind: "article",
            label: "Article 74",
            path: "/read/crd-iv/articles/74",
            snippet: [{ text: "Internal governance", highlighted: true }],
          },
        ],
      }),
    };

    expect(
      new CitationRetrievalService(fallbackSearch, context).search("governance")
        .results[0],
    ).toMatchObject({
      searchRecordId: "unindexed-search-record",
      resolvedEntityId: "eu:32013L0036:article:74",
      resolution: "root-provision-fallback",
    });
  });

  it("passes the reviewed CRD, CSSF, and EBA Top-N benchmark", () => {
    if (!retrieval) throw new Error("Citation retrieval service unavailable");
    expect(
      evaluateCitationRetrieval(retrieval, loadCitationRetrievalBenchmark()),
    ).toMatchObject({
      caseCount: 3,
      passedCaseCount: 3,
      hitRate: 1,
      passed: true,
    });
  });
});
