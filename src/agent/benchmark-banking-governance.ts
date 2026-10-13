import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { SearchService } from "../search/full-text-search";
import { RegulatoryTopicService } from "../topics/regulatory-topic-service";
import {
  evaluateBankingGovernance,
  loadBankingGovernanceTasks,
} from "./banking-governance-evaluation";
import { CitationContextService } from "./citation-context-service";
import { CitationRetrievalService } from "./citation-retrieval-service";

const repository = new SqliteRuntimeRepository();
const search = new SearchService();
try {
  const dataset = loadBankingGovernanceTasks();
  const documents = repository.listDocumentViews();
  const context = new CitationContextService(repository, documents);
  const report = evaluateBankingGovernance(
    {
      context,
      retrieval: new CitationRetrievalService(search, context),
      documents,
      topic: new RegulatoryTopicService(repository).findBySlug(
        dataset.topicSlug,
      ),
    },
    dataset,
  );
  const directory = resolve(
    process.cwd(),
    "data/artifacts/evaluations/banking-governance",
  );
  mkdirSync(directory, { recursive: true });
  const reportPath = resolve(
    directory,
    `${Date.now()}-${repository.buildId}.json`,
  );
  writeFileSync(
    reportPath,
    `${JSON.stringify({ measuredAt: new Date().toISOString(), ...report }, null, 2)}\n`,
    { flag: "wx" },
  );
  console.log(JSON.stringify({ reportPath, ...report }, null, 2));
  // Evidence/navigation regressions fail; retrieval gaps remain visible diagnostics.
  // This does not replace or relax the existing citation/release regression gates.
  if (!report.summary.evidenceAndNavigationPassed) process.exitCode = 1;
} finally {
  search.close();
  repository.close();
}
