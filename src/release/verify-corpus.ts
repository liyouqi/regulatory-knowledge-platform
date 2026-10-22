import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadDocumentViews } from "../data/document-repository";
import { readVerifiedAmfSourceSnapshot } from "../ingestion/amf-snapshot";
import { loadAmfSourceRegistry } from "../ingestion/amf-source-registry";
import { readVerifiedCssfSourceSnapshot } from "../ingestion/cssf-snapshot";
import {
  cssfDocumentLogicalId,
  loadCssfSourceRegistry,
} from "../ingestion/cssf-source-registry";
import { readVerifiedEbaSourceSnapshot } from "../ingestion/eba-snapshot";
import { loadEbaSourceRegistry } from "../ingestion/eba-source-registry";
import { readVerifiedNationalSourceSnapshot } from "../ingestion/national-snapshot";
import { loadNationalSourceRegistry } from "../ingestion/national-source-registry";
import { readVerifiedSourceSnapshot } from "../ingestion/snapshot";
import { loadSourceRegistry } from "../ingestion/source-registry";
import { verifyRuntimeArtifact } from "../runtime/verify-runtime-artifact";

function snapshotDirectories(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (!entry.isDirectory()) return [];
    if (existsSync(resolve(path, "snapshot.json"))) return [path];
    return snapshotDirectories(path);
  });
}

function assertSameIds(
  label: string,
  actual: Set<string>,
  expected: Set<string>,
) {
  const missing = [...expected].filter((id) => !actual.has(id));
  const unexpected = [...actual].filter((id) => !expected.has(id));
  if (missing.length === 0 && unexpected.length === 0) return;
  throw new Error(
    `${label} document set differs from the source registries: missing [${missing.join(
      ", ",
    )}], unexpected [${unexpected.join(", ")}]`,
  );
}

export function assertContainsIds(
  label: string,
  actual: Set<string>,
  expected: Set<string>,
) {
  const missing = [...expected].filter((id) => !actual.has(id));
  if (missing.length === 0) return;
  throw new Error(
    `${label} is missing source-registry documents: [${missing.join(", ")}]`,
  );
}

export interface CorpusVerification {
  sourceRegistryDocuments: number;
  verifiedRawSnapshots: number;
  canonicalDocuments: number;
  runtimeDocuments: number;
  runtimeBuildId: string;
  runtimeProfileId: string;
  runtimeProfileHash: string;
  runtimeRecords: number;
  runtimeRelationships: number;
  runtimeTimelineEvents: number;
  runtimeSupervisoryDecisions: number;
  runtimeSupervisoryDecisionFindings: number;
  runtimeApplicabilityRules: number;
  runtimeApplicabilityEvidence: number;
  runtimeRegulatoryTopics: number;
  runtimeTopicAssignments: number;
  unresolvedReferences: number;
}

export async function verifyCorpus(): Promise<CorpusVerification> {
  const [euSources, cssfSources, ebaSources, amfSources] = await Promise.all([
    loadSourceRegistry(),
    loadCssfSourceRegistry(),
    loadEbaSourceRegistry(),
    loadAmfSourceRegistry(),
  ]);
  const nationalSources = await loadNationalSourceRegistry();
  const expectedIds = new Set([
    ...euSources.map((source) => `eu:${source.celex}`),
    ...cssfSources.map((source) => cssfDocumentLogicalId(source.localId)),
    ...ebaSources.map((source) => source.documentId),
    ...nationalSources.map((source) => source.documentId),
    ...amfSources
      .filter((source) => source.status === "active")
      .map((source) => source.documentId),
  ]);

  const euSnapshotDirectories = snapshotDirectories(
    resolve(process.cwd(), "data/raw/eur-lex"),
  );
  const cssfSnapshotDirectories = snapshotDirectories(
    resolve(process.cwd(), "data/raw/cssf"),
  );
  const ebaSnapshotDirectories = snapshotDirectories(
    resolve(process.cwd(), "data/raw/eba"),
  );
  const nationalSnapshotDirectories = snapshotDirectories(
    resolve(process.cwd(), "data/raw/national"),
  );
  const amfSnapshotDirectories = snapshotDirectories(
    resolve(process.cwd(), "data/raw/amf-snapshots"),
  );
  const [
    euSnapshots,
    cssfSnapshots,
    ebaSnapshots,
    nationalSnapshots,
    amfSnapshots,
  ] = await Promise.all([
    Promise.all(euSnapshotDirectories.map(readVerifiedSourceSnapshot)),
    Promise.all(cssfSnapshotDirectories.map(readVerifiedCssfSourceSnapshot)),
    Promise.all(ebaSnapshotDirectories.map(readVerifiedEbaSourceSnapshot)),
    Promise.all(
      nationalSnapshotDirectories.map(readVerifiedNationalSourceSnapshot),
    ),
    Promise.all(amfSnapshotDirectories.map(readVerifiedAmfSourceSnapshot)),
  ]);
  const rawIds = new Set([
    ...euSnapshots.map((snapshot) => `eu:${snapshot.snapshot.celex}`),
    ...cssfSnapshots.map((snapshot) => snapshot.snapshot.documentId),
    ...ebaSnapshots.map((snapshot) => snapshot.snapshot.documentId),
    ...nationalSnapshots.map((snapshot) => snapshot.snapshot.documentId),
    ...amfSnapshots.map((snapshot) => snapshot.snapshot.documentId),
  ]);
  // Raw storage is an immutable acquisition history and may also contain
  // verified candidates that have not passed the publication gates yet.
  // Canonical and Runtime remain exact closed sets below.
  assertContainsIds("Verified raw snapshots", rawIds, expectedIds);

  const canonicalDocuments = loadDocumentViews();
  if (
    canonicalDocuments.some((document) => document.provenance !== "official")
  ) {
    throw new Error("Canonical document set contains a fixture");
  }
  assertSameIds(
    "Canonical documents",
    new Set(canonicalDocuments.map((document) => document.id)),
    expectedIds,
  );

  const runtime = verifyRuntimeArtifact(undefined, expectedIds);

  return {
    sourceRegistryDocuments: expectedIds.size,
    verifiedRawSnapshots:
      euSnapshots.length +
      cssfSnapshots.length +
      ebaSnapshots.length +
      nationalSnapshots.length +
      amfSnapshots.length,
    canonicalDocuments: canonicalDocuments.length,
    runtimeDocuments: runtime.documents,
    runtimeBuildId: runtime.buildId,
    runtimeProfileId: runtime.profileId,
    runtimeProfileHash: runtime.profileHash,
    runtimeRecords: runtime.records,
    runtimeRelationships: runtime.relationships,
    runtimeTimelineEvents: runtime.timelineEvents,
    runtimeSupervisoryDecisions: runtime.supervisoryDecisions,
    runtimeSupervisoryDecisionFindings: runtime.supervisoryDecisionFindings,
    runtimeApplicabilityRules: runtime.applicabilityRules,
    runtimeApplicabilityEvidence: runtime.applicabilityEvidence,
    runtimeRegulatoryTopics: runtime.regulatoryTopics,
    runtimeTopicAssignments: runtime.topicAssignments,
    unresolvedReferences: runtime.unresolvedReferences,
  };
}

if (process.argv[1]?.endsWith("verify-corpus.ts")) {
  verifyCorpus()
    .then((report) => console.table(report))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
