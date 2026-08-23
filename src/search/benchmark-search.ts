import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import process from "node:process";
import Database from "better-sqlite3";
import { FullTextSearchService } from "./full-text-search";

const EVALUATION_CASES = [
  { query: "operational risk", expectedLaw: "DORA" },
  { query: '"management body"', expectedLaw: "MiCA" },
  { query: "personal data controller", expectedLaw: "GDPR" },
  { query: "artificial intelligence system", expectedLaw: "AI Act" },
  { query: "crypto asset", expectedLaw: "MiCA" },
  { query: "data holder", expectedLaw: "Data Act" },
] as const;

const WARMUP_CYCLES = 10;
const MEASURED_CYCLES = 100;

function percentile(sortedValues: number[], percentileValue: number): number {
  return sortedValues[
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1)
  ];
}

function sqliteVersion(): string {
  const database = new Database(":memory:");
  try {
    const row = database
      .prepare("SELECT sqlite_version() AS version")
      .get() as {
      version: string;
    };
    return row.version;
  } finally {
    database.close();
  }
}

const service = new FullTextSearchService();
try {
  const evaluation = EVALUATION_CASES.map(({ query, expectedLaw }) => {
    const startedAt = performance.now();
    const response = service.search(query, { limit: 20 });
    const firstQueryMs = performance.now() - startedAt;
    const laws = [
      ...new Set(response.results.map((result) => result.shortName)),
    ];
    if (!laws.includes(expectedLaw)) {
      throw new Error(
        `Evaluation failed for ${JSON.stringify(query)}: expected ${expectedLaw}`,
      );
    }
    return {
      query,
      expectedLaw,
      resultCount: response.results.length,
      laws,
      firstQueryMs: Number(firstQueryMs.toFixed(3)),
    };
  });

  for (let cycle = 0; cycle < WARMUP_CYCLES; cycle += 1) {
    for (const { query } of EVALUATION_CASES)
      service.search(query, { limit: 20 });
  }

  const timings: number[] = [];
  for (let cycle = 0; cycle < MEASURED_CYCLES; cycle += 1) {
    for (const { query } of EVALUATION_CASES) {
      const startedAt = performance.now();
      service.search(query, { limit: 20 });
      timings.push(performance.now() - startedAt);
    }
  }
  timings.sort((left, right) => left - right);

  console.log(
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        runtime: {
          node: process.version,
          sqlite: sqliteVersion(),
          platform: process.platform,
          architecture: process.arch,
          cpu: cpus()[0]?.model ?? "unknown",
          logicalCpuCount: cpus().length,
          memoryGiB: Number((totalmem() / 1024 ** 3).toFixed(1)),
        },
        corpus: {
          buildId: service.buildId,
          documentCount: service.documentCount,
          recordCount: service.recordCount,
        },
        method: {
          queryCount: EVALUATION_CASES.length,
          warmupCycles: WARMUP_CYCLES,
          measuredCycles: MEASURED_CYCLES,
          sampleCount: timings.length,
          limit: 20,
        },
        latencyMs: {
          p50: Number(percentile(timings, 0.5).toFixed(3)),
          p95: Number(percentile(timings, 0.95).toFixed(3)),
          max: Number(timings.at(-1)?.toFixed(3)),
        },
        evaluation,
      },
      null,
      2,
    ),
  );
} finally {
  service.close();
}
