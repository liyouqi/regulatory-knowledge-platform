import { loadDocumentViews } from "../data/document-repository";
import { loadCssfSourceRegistrySync } from "../ingestion/cssf-source-registry";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import {
  DEFAULT_RUNTIME_DATABASE_PATH,
  buildRuntimeDatabase,
} from "./sqlite-search-index";

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
if (outputIndex >= 0 && !outputPath) {
  throw new Error("Usage: npm run runtime:build -- [--output <sqlite-path>]");
}

const manifest = buildRuntimeDatabase(
  loadDocumentViews(),
  [...loadSourceRegistrySync(), ...loadCssfSourceRegistrySync()],
  outputPath ?? DEFAULT_RUNTIME_DATABASE_PATH,
);
console.table({
  buildId: manifest.buildId,
  documents: manifest.documentCount,
  records: manifest.recordCount,
  definitions: manifest.definitionCount,
  relationships: manifest.relationshipCount,
  relatedRecitals: manifest.relatedRecitalCount,
  tfidfBenchmark: manifest.tfidfBenchmark?.passed
    ? `${manifest.tfidfBenchmark.passedCaseCount}/${manifest.tfidfBenchmark.caseCount} passed`
    : "not published",
  unresolvedReferences: manifest.unresolvedReferenceCount,
  bytes: manifest.byteCount,
  output: manifest.outputPath,
});
