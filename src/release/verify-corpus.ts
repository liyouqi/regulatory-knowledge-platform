import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadDocumentViews } from "../data/document-repository";
import { readVerifiedCssfSourceSnapshot } from "../ingestion/cssf-snapshot";
import {
  cssfDocumentLogicalId,
  loadCssfSourceRegistry,
} from "../ingestion/cssf-source-registry";
import { readVerifiedSourceSnapshot } from "../ingestion/snapshot";
import { loadSourceRegistry } from "../ingestion/source-registry";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
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
  unresolvedReferences: number;
}

export async function verifyCorpus(): Promise<CorpusVerification> {
  const [euSources, cssfSources] = await Promise.all([
    loadSourceRegistry(),
    loadCssfSourceRegistry(),
  ]);
  const expectedIds = new Set([
    ...euSources.map((source) => `eu:${source.celex}`),
    ...cssfSources.map((source) => cssfDocumentLogicalId(source.localId)),
  ]);

  const euSnapshotDirectories = snapshotDirectories(
    resolve(process.cwd(), "data/raw/eur-lex"),
  );
  const cssfSnapshotDirectories = snapshotDirectories(
    resolve(process.cwd(), "data/raw/cssf"),
  );
  const [euSnapshots, cssfSnapshots] = await Promise.all([
    Promise.all(euSnapshotDirectories.map(readVerifiedSourceSnapshot)),
    Promise.all(cssfSnapshotDirectories.map(readVerifiedCssfSourceSnapshot)),
  ]);
  const rawIds = new Set([
    ...euSnapshots.map((snapshot) => `eu:${snapshot.snapshot.celex}`),
    ...cssfSnapshots.map((snapshot) => snapshot.snapshot.documentId),
  ]);
  assertSameIds("Verified raw snapshots", rawIds, expectedIds);

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

  const runtime = verifyRuntimeArtifact();
  const repository = new SqliteRuntimeRepository();
  try {
    assertSameIds(
      "Runtime documents",
      new Set(repository.listDocumentViews().map((document) => document.id)),
      expectedIds,
    );
  } finally {
    repository.close();
  }

  return {
    sourceRegistryDocuments: expectedIds.size,
    verifiedRawSnapshots: euSnapshots.length + cssfSnapshots.length,
    canonicalDocuments: canonicalDocuments.length,
    runtimeDocuments: runtime.documents,
    runtimeBuildId: runtime.buildId,
    runtimeProfileId: runtime.profileId,
    runtimeProfileHash: runtime.profileHash,
    runtimeRecords: runtime.records,
    runtimeRelationships: runtime.relationships,
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
