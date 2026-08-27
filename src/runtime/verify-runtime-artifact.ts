import { statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SearchService } from "../search/full-text-search";
import { runtimeDatabasePath } from "./runtime-database-path";
import { SqliteRuntimeRepository } from "./sqlite-runtime-repository";

export interface RuntimeArtifactVerification {
  buildId: string;
  profileId: string;
  profileVersion: string;
  profileHash: string;
  documents: number;
  records: number;
  definitions: number;
  relationships: number;
  cellarRelationships: number;
  lifecycleRelationships: number;
  externalWorks: number;
  cases: number;
  caseLawRelationships: number;
  relatedRecitals: number;
  versionNodes: number;
  versionEdges: number;
  regulatoryDomains: number;
  domainAssignments: number;
  authorities: number;
  authorityRelationships: number;
  timelineEvents: number;
  supervisoryDecisions: number;
  supervisoryDecisionFindings: number;
  applicabilityRules: number;
  applicabilityEvidence: number;
  regulatoryTopics: number;
  topicAssignments: number;
  unresolvedReferences: number;
  bytes: number;
  input: string;
}

export function verifyRuntimeArtifact(
  databasePath = runtimeDatabasePath(),
): RuntimeArtifactVerification {
  const search = new SearchService(databasePath);
  const repository = new SqliteRuntimeRepository(databasePath);
  try {
    const documents = repository.listDocumentViews();
    const summaries = repository.listDocumentSummaries();
    if (documents.length !== search.documentCount) {
      throw new Error(
        `Runtime document count mismatch: search manifest has ${search.documentCount}, Reader has ${documents.length}`,
      );
    }
    if (summaries.length !== documents.length) {
      throw new Error(
        `Runtime document summary mismatch: expected ${documents.length}, received ${summaries.length}`,
      );
    }
    if (search.buildId !== repository.buildId) {
      throw new Error(
        `Runtime build ID mismatch: search has ${search.buildId}, Reader has ${repository.buildId}`,
      );
    }
    if (
      search.profileId !== repository.profileId ||
      search.profileHash !== repository.profileHash
    ) {
      throw new Error(
        `Runtime Profile mismatch: search has ${search.profileId}@${search.profileHash}, Reader has ${repository.profileId}@${repository.profileHash}`,
      );
    }
    return {
      buildId: search.buildId,
      profileId: repository.profileId,
      profileVersion: repository.profileVersion,
      profileHash: repository.profileHash,
      documents: documents.length,
      records: search.recordCount,
      definitions: search.definitionCount,
      relationships: repository.relationshipCount,
      cellarRelationships: repository.cellarRelationshipCount,
      lifecycleRelationships: repository.lifecycleRelationshipCount,
      externalWorks: repository.externalWorkCount,
      cases: repository.caseCount,
      caseLawRelationships: repository.caseLawRelationshipCount,
      relatedRecitals: repository.relatedRecitalCount,
      versionNodes: repository.versionNodeCount,
      versionEdges: repository.versionEdgeCount,
      regulatoryDomains: repository.domainCount,
      domainAssignments: repository.domainAssignmentCount,
      authorities: repository.authorityCount,
      authorityRelationships: repository.authorityRelationshipCount,
      timelineEvents: repository.timelineEventCount,
      supervisoryDecisions: repository.supervisoryDecisionCount,
      supervisoryDecisionFindings: repository.supervisoryDecisionFindingCount,
      applicabilityRules: repository.applicabilityRuleCount,
      applicabilityEvidence: repository.applicabilityEvidenceCount,
      regulatoryTopics: repository.topicCount,
      topicAssignments: repository.topicAssignmentCount,
      unresolvedReferences: repository.unresolvedReferenceCount,
      bytes: statSync(databasePath).size,
      input: databasePath,
    };
  } finally {
    repository.close();
    search.close();
  }
}

function inputArgument(): string | undefined {
  const index = process.argv.indexOf("--input");
  if (index < 0) return undefined;
  const input = process.argv[index + 1];
  if (!input) {
    throw new Error("Usage: npm run runtime:verify -- [--input <sqlite-path>]");
  }
  return input;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  console.table(verifyRuntimeArtifact(inputArgument()));
}
