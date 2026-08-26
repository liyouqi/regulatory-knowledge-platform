import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { CitationRetrievalService } from "./citation-retrieval-service";

export const DEFAULT_CITATION_RETRIEVAL_BENCHMARK_PATH = resolve(
  process.cwd(),
  "data/benchmarks/citation-retrieval.json",
);

const benchmarkSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    reviewedAt: z.string().datetime(),
    topN: z.number().int().min(1).max(10),
    minimumHitRate: z.number().min(0).max(1),
    cases: z
      .array(
        z
          .object({
            id: z.string().startsWith("citation-retrieval:"),
            query: z.string().min(1),
            expectedEntityIds: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type CitationRetrievalBenchmark = z.infer<typeof benchmarkSchema>;

export interface CitationRetrievalEvaluation {
  caseCount: number;
  passedCaseCount: number;
  hitRate: number;
  minimumHitRate: number;
  passed: boolean;
  cases: Array<{
    id: string;
    query: string;
    expectedEntityIds: string[];
    topEntityIds: string[];
    matchedEntityIds: string[];
    passed: boolean;
  }>;
}

export function loadCitationRetrievalBenchmark(
  path = DEFAULT_CITATION_RETRIEVAL_BENCHMARK_PATH,
): CitationRetrievalBenchmark {
  return benchmarkSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function evaluateCitationRetrieval(
  service: CitationRetrievalService,
  benchmark = loadCitationRetrievalBenchmark(),
): CitationRetrievalEvaluation {
  const cases = benchmark.cases.map((item) => {
    const response = service.search(item.query, { limit: benchmark.topN });
    const topEntityIds = response.results.map(
      (result) => result.resolvedEntityId,
    );
    const matchedEntityIds = item.expectedEntityIds.filter((entityId) =>
      topEntityIds.includes(entityId),
    );
    return {
      ...item,
      topEntityIds,
      matchedEntityIds,
      passed: matchedEntityIds.length > 0,
    };
  });
  const passedCaseCount = cases.filter((item) => item.passed).length;
  const hitRate = cases.length > 0 ? passedCaseCount / cases.length : 0;
  return {
    caseCount: cases.length,
    passedCaseCount,
    hitRate,
    minimumHitRate: benchmark.minimumHitRate,
    passed: hitRate >= benchmark.minimumHitRate,
    cases,
  };
}
