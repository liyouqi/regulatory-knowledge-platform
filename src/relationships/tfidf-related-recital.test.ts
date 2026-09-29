import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import {
  TFIDF_RELATED_RECITAL_BUILDER,
  TFIDF_RELATED_RECITAL_BUILDER_VERSION,
  buildTfidfRelatedRecitals,
  loadRelatedRecitalBenchmark,
} from "./tfidf-related-recital";

const documents = loadDocumentViews();

describe("TF-IDF related-recital builder", () => {
  it("passes the reviewed DORA Top-N benchmark for the loaded expression", () => {
    const result = buildTfidfRelatedRecitals(documents);

    expect(result.evaluation).toMatchObject({
      caseCount: 2,
      passedCaseCount: 2,
      hitRate: 1,
      passed: true,
    });
    expect(result.evaluation.cases.every((item) => item.passed)).toBe(true);
    expect(result.relationships.length).toBeGreaterThan(300);
  });

  it("publishes deterministic scored relationships only for benchmarked laws", () => {
    const first = buildTfidfRelatedRecitals(documents);
    const repeated = buildTfidfRelatedRecitals([...documents].reverse());

    expect(repeated).toEqual(first);
    expect(first.relationships[0]).toMatchObject({
      relationType: "RELATED_RECITAL",
      provenance: "TFIDF",
      builderMethod: TFIDF_RELATED_RECITAL_BUILDER,
      builderVersion: TFIDF_RELATED_RECITAL_BUILDER_VERSION,
      score: expect.any(Number),
    });
    expect(
      new Set(
        first.relationships.map(
          (relationship) => relationship.sourceEntityId.split(":article:")[0],
        ),
      ),
    ).toEqual(new Set(["eu:32022R2554"]));
    expect(
      new Set(first.relationships.map((relationship) => relationship.id)).size,
    ).toBe(first.relationships.length);
  });

  it("publishes no algorithmic relationships when the benchmark gate fails", () => {
    const benchmark = structuredClone(loadRelatedRecitalBenchmark());
    benchmark.cases[0].expectedRecitalIds = ["eu:32022R2554:recital:1"];

    const result = buildTfidfRelatedRecitals(documents, benchmark);

    expect(result.evaluation.passed).toBe(false);
    expect(result.relationships).toEqual([]);
  });
});
