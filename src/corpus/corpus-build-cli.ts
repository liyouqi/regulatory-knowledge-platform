import { buildCorpus } from "./corpus-build";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const profileId = argument("--profile");
const manifestPath = argument("--manifest");
const outputDirectory = argument("--output");
for (const [name, value] of [
  ["--profile", profileId],
  ["--manifest", manifestPath],
  ["--output", outputDirectory],
] as const) {
  if (process.argv.includes(name) && !value) {
    throw new Error(
      "Usage: npm run corpus:build -- [--profile <profile-id>] [--manifest <manifest-path>] [--output <directory>] [--require-archived]",
    );
  }
}

buildCorpus({
  profileId,
  manifestPath,
  outputDirectory,
  requireArchived: process.argv.includes("--require-archived"),
})
  .then((report) => {
    console.table({
      status: report.status,
      manifestId: report.manifest.id,
      manifestHash: report.manifest.hash,
      buildRequestHash: report.buildRequestHash,
      profileId: report.profile.id,
      sources: report.sources.length,
      archivedSources: report.archiveGate.archivedSources,
      localOnlySources: report.archiveGate.localOnlySources,
      runtimeBuildId: report.runtime?.buildId,
      runtimeDocuments: report.runtime?.documents,
      runtimeRecords: report.runtime?.records,
      runtimeRelationships: report.runtime?.relationships,
      artifact: report.runtime?.artifact,
    });
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
