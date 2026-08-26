import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { SearchService } from "../search/full-text-search";
import { CitationContextService } from "./citation-context-service";
import {
  evaluateCitationRetrieval,
  loadCitationRetrievalBenchmark,
} from "./citation-retrieval-benchmark";
import { CitationRetrievalService } from "./citation-retrieval-service";

const repository = new SqliteRuntimeRepository();
const search = new SearchService();

try {
  const context = new CitationContextService(repository);
  const retrieval = new CitationRetrievalService(search, context);
  const benchmark = loadCitationRetrievalBenchmark();
  const evaluation = evaluateCitationRetrieval(retrieval, benchmark);
  console.log(
    JSON.stringify(
      {
        service: "citation-retrieval@1.0.0",
        runtimeBuildId: repository.buildId,
        profileId: repository.profileId,
        reviewedAt: benchmark.reviewedAt,
        topN: benchmark.topN,
        evaluation,
      },
      null,
      2,
    ),
  );
  if (!evaluation.passed) process.exitCode = 1;
} finally {
  search.close();
  repository.close();
}
