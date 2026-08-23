import { loadDocumentViews } from "../data/document-repository";
import {
  DEFAULT_SEARCH_INDEX_PATH,
  buildSearchIndex,
} from "./sqlite-search-index";

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
if (outputIndex >= 0 && !outputPath) {
  throw new Error("Usage: npm run search:build -- [--output <sqlite-path>]");
}

const manifest = buildSearchIndex(
  loadDocumentViews(),
  outputPath ?? DEFAULT_SEARCH_INDEX_PATH,
);
console.table({
  buildId: manifest.buildId,
  documents: manifest.documentCount,
  records: manifest.recordCount,
  bytes: manifest.byteCount,
  output: manifest.outputPath,
});
