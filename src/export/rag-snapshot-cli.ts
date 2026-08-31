import { resolve } from "node:path";
import { DEFAULT_RUNTIME_DATABASE_PATH } from "../search/sqlite-search-index";
import { exportRagSnapshot, verifyRagSnapshot } from "./rag-snapshot";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2];
if (command === "export") {
  const snapshotId = option("--snapshot-id");
  const asOfDate = option("--as-of");
  const outputPath = option("--output");
  const databasePath = option("--database") ?? DEFAULT_RUNTIME_DATABASE_PATH;
  if (!snapshotId || !asOfDate || !outputPath) {
    throw new Error(
      "Usage: npm run rag:export -- --snapshot-id <id> --as-of <YYYY-MM-DD> --output <directory> [--database <runtime.sqlite>]",
    );
  }
  const manifest = exportRagSnapshot({
    snapshotId,
    asOfDate,
    outputPath,
    databasePath,
  });
  console.table({
    snapshotId: manifest.snapshot_id,
    profile: `${manifest.profile_id}@${manifest.profile_version}`,
    runtimeBuildId: manifest.runtime_build_id,
    documents: manifest.document_count,
    provisions: manifest.provision_count,
    relationships: manifest.relationship_count,
    output: resolve(outputPath),
  });
} else if (command === "verify") {
  const inputPath = option("--input");
  if (!inputPath) {
    throw new Error(
      "Usage: npm run rag:export:verify -- --input <snapshot-directory>",
    );
  }
  const manifest = verifyRagSnapshot(inputPath);
  console.table({
    snapshotId: manifest.snapshot_id,
    documents: manifest.document_count,
    provisions: manifest.provision_count,
    relationships: manifest.relationship_count,
    status: "verified",
  });
} else {
  throw new Error("Expected command: export or verify");
}
