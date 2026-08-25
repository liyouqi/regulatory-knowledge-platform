import { loadDocumentViews } from "../data/document-repository";
import { loadCssfSourceRegistrySync } from "../ingestion/cssf-source-registry";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import {
  findEditionProfile,
  loadEditionProfileRegistrySync,
} from "../runtime/edition-profile";
import {
  DEFAULT_RUNTIME_DATABASE_PATH,
  buildRuntimeDatabase,
} from "./sqlite-search-index";

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
const profileIndex = process.argv.indexOf("--profile");
const profileArgument =
  profileIndex >= 0 ? process.argv[profileIndex + 1] : undefined;
const environmentProfile = process.env.REGULATORY_EDITION_PROFILE?.trim();
const profileId = profileArgument || environmentProfile || undefined;
if (
  (outputIndex >= 0 && !outputPath) ||
  (profileIndex >= 0 && !profileArgument)
) {
  throw new Error(
    "Usage: npm run runtime:build -- [--profile <profile-id>] [--output <sqlite-path>]",
  );
}
const profile = findEditionProfile(profileId, loadEditionProfileRegistrySync());

const manifest = buildRuntimeDatabase(
  loadDocumentViews(),
  [...loadSourceRegistrySync(), ...loadCssfSourceRegistrySync()],
  outputPath ?? DEFAULT_RUNTIME_DATABASE_PATH,
  profile,
);
console.table({
  buildId: manifest.buildId,
  profileId: manifest.profileId,
  profileVersion: manifest.profileVersion,
  profileHash: manifest.profileHash,
  documents: manifest.documentCount,
  records: manifest.recordCount,
  definitions: manifest.definitionCount,
  relationships: manifest.relationshipCount,
  cellarRelationships: manifest.cellarRelationshipCount,
  lifecycleRelationships: manifest.lifecycleRelationshipCount,
  externalWorks: manifest.externalWorkCount,
  cases: manifest.caseCount,
  caseLawRelationships: manifest.caseLawRelationshipCount,
  relatedRecitals: manifest.relatedRecitalCount,
  versionNodes: manifest.versionNodeCount,
  versionEdges: manifest.versionEdgeCount,
  tfidfBenchmark: manifest.tfidfBenchmark?.passed
    ? `${manifest.tfidfBenchmark.passedCaseCount}/${manifest.tfidfBenchmark.caseCount} passed`
    : "not published",
  unresolvedReferences: manifest.unresolvedReferenceCount,
  bytes: manifest.byteCount,
  output: manifest.outputPath,
});
