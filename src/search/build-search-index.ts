import { loadDocumentViews } from "../data/document-repository";
import { loadCssfSourceRegistrySync } from "../ingestion/cssf-source-registry";
import { loadEbaSourceRegistrySync } from "../ingestion/eba-source-registry";
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
const reviewModeIndex = process.argv.indexOf("--review-mode");
const reviewModeArgument =
  reviewModeIndex >= 0 ? process.argv[reviewModeIndex + 1] : undefined;
const environmentProfile = process.env.REGULATORY_EDITION_PROFILE?.trim();
const profileId = profileArgument || environmentProfile || undefined;
if (
  (outputIndex >= 0 && !outputPath) ||
  (profileIndex >= 0 && !profileArgument) ||
  (reviewModeIndex >= 0 &&
    reviewModeArgument !== "strict" &&
    reviewModeArgument !== "report")
) {
  throw new Error(
    "Usage: npm run runtime:build -- [--profile <profile-id>] [--output <sqlite-path>] [--review-mode <strict|report>]",
  );
}
const profile = findEditionProfile(profileId, loadEditionProfileRegistrySync());

const manifest = buildRuntimeDatabase(
  loadDocumentViews(),
  [
    ...loadSourceRegistrySync(),
    ...loadCssfSourceRegistrySync(),
    ...loadEbaSourceRegistrySync(),
  ],
  outputPath ?? DEFAULT_RUNTIME_DATABASE_PATH,
  profile,
  {
    reviewValidationMode: reviewModeArgument === "report" ? "report" : "strict",
  },
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
  expressionMetadata: manifest.expressionMetadataCount,
  regulatoryDomains: manifest.domainCount,
  domainAssignments: manifest.domainAssignmentCount,
  authorities: manifest.authorityCount,
  authorityRelationships: manifest.authorityRelationshipCount,
  timelineEvents: manifest.timelineEventCount,
  supervisoryDecisions: manifest.supervisoryDecisionCount,
  supervisoryDecisionFindings: manifest.supervisoryDecisionFindingCount,
  applicabilityRules: manifest.applicabilityRuleCount,
  applicabilityEvidence: manifest.applicabilityEvidenceCount,
  regulatoryTopics: manifest.topicCount,
  topicAssignments: manifest.topicAssignmentCount,
  ebaQaRecords: manifest.ebaQaCount,
  ebaQaDetails: manifest.ebaQaDetailCount,
  ebaQaReferences: manifest.ebaQaReferenceCount,
  dossiers: manifest.dossierCount,
  dossierSections: manifest.dossierSectionCount,
  dossierSources: manifest.dossierSourceCount,
  tfidfBenchmark: manifest.tfidfBenchmark?.passed
    ? `${manifest.tfidfBenchmark.passedCaseCount}/${manifest.tfidfBenchmark.caseCount} passed`
    : "not published",
  unresolvedReferences: manifest.unresolvedReferenceCount,
  reviewedInputIssues: manifest.reviewedInputIssues.length,
  bytes: manifest.byteCount,
  output: manifest.outputPath,
});
if (manifest.reviewedInputIssues.length > 0) {
  console.warn("Reviewed mappings omitted from this runtime:");
  console.table(manifest.reviewedInputIssues);
}
