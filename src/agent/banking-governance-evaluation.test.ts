import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { SearchService } from "../search/full-text-search";
import type { CitationRetrievalResponse } from "../shared/citation-retrieval";
import { RegulatoryTopicService } from "../topics/regulatory-topic-service";
import {
  bankingGovernanceTasksSchema,
  evaluateBankingGovernance,
  loadBankingGovernanceTasks,
} from "./banking-governance-evaluation";
import { CitationContextService } from "./citation-context-service";
import { CitationRetrievalService } from "./citation-retrieval-service";

let repository: SqliteRuntimeRepository;
let search: SearchService;
let services: Parameters<typeof evaluateBankingGovernance>[0];
const dataset = loadBankingGovernanceTasks();

beforeAll(() => {
  repository = new SqliteRuntimeRepository();
  search = new SearchService();
  const documents = repository.listDocumentViews();
  const context = new CitationContextService(repository, documents);
  services = {
    documents,
    context,
    retrieval: new CitationRetrievalService(search, context),
    topic: new RegulatoryTopicService(repository).findBySlug(dataset.topicSlug),
  };
}, 120_000);
afterAll(() => {
  search?.close();
  repository?.close();
});

function oneCase() {
  return {
    ...structuredClone(dataset),
    cases: [structuredClone(dataset.cases[0])],
  };
}

function emptyRetrieval() {
  return {
    search: vi.fn(
      (query: string): CitationRetrievalResponse => ({
        schemaVersion: "1.0.0",
        query,
        normalizedQuery: query,
        runtime: services.context.runtimeIdentity,
        retrieval: {
          method: "fts5-to-citation-context",
          version: "1.0.0",
          requestedLimit: 5,
          searchedRecordLimit: 15,
          resultCount: 0,
        },
        results: [],
      }),
    ),
  };
}

describe("banking governance task audit", () => {
  it("loads only the three Topic documents without reading the whole corpus", () => {
    const allViews = vi
      .spyOn(repository, "listDocumentViews")
      .mockImplementation(() => {
        throw new Error("Topic detail must not read the entire corpus");
      });
    const find = vi.spyOn(repository, "findDocument");
    try {
      const topic = new RegulatoryTopicService(repository).findBySlug(
        dataset.topicSlug,
      );
      expect(topic).toEqual(services.topic);
      expect(find.mock.calls.map(([id]) => id).sort()).toEqual(
        dataset.sources.map((source) => source.documentId).sort(),
      );
      expect(allViews).not.toHaveBeenCalled();
    } finally {
      allViews.mockRestore();
      find.mockRestore();
    }
  });

  it("resolves all eighteen frozen evidence targets and exact topic Reader routes", () => {
    const report = evaluateBankingGovernance(services, dataset);
    expect(report.summary).toMatchObject({
      caseCount: 18,
      evidencePassed: 18,
      navigationPassed: 18,
      evidenceAndNavigationPassed: true,
    });
    expect(report.method).toMatchObject({
      queryRewriting: false,
      retrievalIsDiagnosticOnly: true,
      answerQualityEvaluated: false,
    });
    expect(
      report.cases.find(
        (item) => item.id === "banking-governance:board-records",
      )?.targetPath,
    ).toBe("/read/circular-cssf-12-552/provisions/part-ii-provision-point-25");
    // Retrieval hit rates are deliberately not asserted to a desired score.
  }, 120_000);

  it("records zero retrieval hits without declaring the evidence/navigation failed", () => {
    const retrieval = emptyRetrieval();
    const item = oneCase();
    const report = evaluateBankingGovernance({ ...services, retrieval }, item);
    expect(report.summary).toMatchObject({
      globalSearchHits: 0,
      documentSearchHits: 0,
      evidenceAndNavigationPassed: true,
    });
    expect(report.cases[0].gaps).toEqual([
      "global-retrieval",
      "document-retrieval",
    ]);
    expect(retrieval.search).toHaveBeenNthCalledWith(1, item.cases[0].query, {
      documentId: undefined,
      limit: 5,
    });
    expect(retrieval.search).toHaveBeenNthCalledWith(2, item.cases[0].query, {
      documentId: item.cases[0].documentId,
      limit: 5,
    });
  });

  it("detects text, locator and source pin drift independently", () => {
    for (const change of ["text", "locator", "snapshot"] as const) {
      const item = oneCase();
      if (change === "text")
        item.cases[0].expectedEvidence.textSha256 = `sha256:${"0".repeat(64)}`;
      if (change === "locator")
        item.cases[0].expectedEvidence.sourceLocator.value = "wrong-locator";
      if (change === "snapshot")
        item.sources[0].sourceSnapshotId = "snapshot:wrong";
      const report = evaluateBankingGovernance(
        { ...services, retrieval: emptyRetrieval() },
        item,
      );
      expect(report.summary.evidenceAndNavigationPassed).toBe(false);
      expect(report.cases[0].gaps).toEqual(["source-or-evidence-drift"]);
    }
  });

  it("fails navigation for absent topics or mismatched Reader routes", () => {
    const item = oneCase();
    const topic = structuredClone(services.topic);
    if (!topic) throw new Error("Governance Topic missing");
    const assignment = topic.documents
      .flatMap((document) => document.assignments)
      .find(
        (candidate) =>
          candidate.targetEntityId === item.cases[0].expectedEvidence.entityId,
      );
    if (!assignment) throw new Error("Expected assignment missing");
    assignment.targetPath = "/read/crd-iv/articles/76";
    for (const candidate of [null, topic]) {
      const report = evaluateBankingGovernance(
        { ...services, topic: candidate, retrieval: emptyRetrieval() },
        item,
      );
      expect(report.summary.evidencePassed).toBe(1);
      expect(report.summary.navigationPassed).toBe(0);
      expect(report.cases[0].gaps).toContain("topic-navigation");
    }
  });

  it("does not count another provision or document as an evidence hit", () => {
    const item = oneCase();
    const wrong = services.context.findByEntityId("eu:32013L0036:article:76");
    if (!wrong) throw new Error("Fixture unavailable");
    const retrieval = emptyRetrieval();
    retrieval.search.mockImplementation((query) => ({
      ...emptyRetrieval().search(query),
      results: [
        {
          rank: 1,
          searchRank: 1,
          searchRecordId: wrong.target.entityId,
          resolvedEntityId: wrong.target.entityId,
          resolution: "exact-search-entity",
          context: wrong,
        },
      ],
    }));
    expect(
      evaluateBankingGovernance({ ...services, retrieval }, item).summary
        .globalSearchHits,
    ).toBe(0);
  });

  it("accepts a retrieved descendant of the expected root Provision", () => {
    const item = oneCase();
    const descendant = services.context.findByEntityId(
      "eu:32013L0036:article:74:paragraph:1",
    );
    if (!descendant) throw new Error("Fixture unavailable");
    const retrieval = emptyRetrieval();
    retrieval.search.mockImplementation((query) => ({
      ...emptyRetrieval().search(query),
      results: [
        {
          rank: 1,
          searchRank: 1,
          searchRecordId: descendant.target.entityId,
          resolvedEntityId: descendant.target.entityId,
          resolution: "exact-search-entity",
          context: descendant,
        },
      ],
    }));
    expect(
      evaluateBankingGovernance({ ...services, retrieval }, item).summary
        .globalSearchHits,
    ).toBe(1);
  });

  it("rejects mixed runtime identities", () => {
    const topic = structuredClone(services.topic);
    if (!topic) throw new Error("Governance Topic missing");
    topic.runtime.buildId = "other-build";
    expect(() =>
      evaluateBankingGovernance(
        { ...services, topic, retrieval: emptyRetrieval() },
        oneCase(),
      ),
    ).toThrow("identities differ");
    const retrieval = emptyRetrieval();
    retrieval.search.mockImplementation((query) => ({
      ...emptyRetrieval().search(query),
      runtime: {
        ...services.context.runtimeIdentity,
        profileId: "other-profile",
      },
    }));
    expect(() =>
      evaluateBankingGovernance({ ...services, retrieval }, oneCase()),
    ).toThrow("identities differ");
  });

  it("rejects duplicate case IDs and unpinned source Documents", () => {
    const duplicate = oneCase();
    duplicate.cases.push(structuredClone(duplicate.cases[0]));
    expect(() => bankingGovernanceTasksSchema.parse(duplicate)).toThrow(
      "Duplicate case IDs",
    );
    const missing = oneCase();
    missing.cases[0].documentId = "unknown";
    expect(() => bankingGovernanceTasksSchema.parse(missing)).toThrow(
      "Missing source",
    );
  });
});
