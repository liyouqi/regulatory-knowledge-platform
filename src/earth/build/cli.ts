import { loadEarthUniverse } from "../universe/earth-universe";
import { compileEarthArtifact } from "./earth-compiler";
import { loadEarthReviewedSourceMetadata } from "./earth-source-metadata";
import { verifyEarthArtifact } from "./verify-earth-artifact";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function repeatedArgument(name: string): string[] {
  return process.argv.flatMap((value, index) =>
    value === name && process.argv[index + 1] ? [process.argv[index + 1]] : [],
  );
}

function requiredArgument(name: string, usage: string): string {
  const value = argument(name);
  if (!value) throw new Error(usage);
  return value;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "build") {
    const universePath = requiredArgument(
      "--universe",
      "Usage: earth build build --universe <file> --source-metadata <file> --snapshot <dir> [--snapshot <dir>] [--relationships <dir>] --output <sqlite>",
    );
    const metadataPath = requiredArgument(
      "--source-metadata",
      "Usage: earth build build --universe <file> --source-metadata <file> --snapshot <dir> [--snapshot <dir>] [--relationships <dir>] --output <sqlite>",
    );
    const snapshots = repeatedArgument("--snapshot");
    if (snapshots.length === 0) {
      throw new Error("Earth build requires at least one --snapshot directory");
    }
    const outputPath = requiredArgument(
      "--output",
      "Earth build requires --output <sqlite>",
    );
    const relationshipSnapshotDirectory = argument("--relationships");
    const result = await compileEarthArtifact({
      universe: await loadEarthUniverse(universePath),
      sourceMetadata: await loadEarthReviewedSourceMetadata(metadataPath),
      snapshotDirectories: snapshots,
      ...(relationshipSnapshotDirectory
        ? { relationshipSnapshotDirectory }
        : {}),
      outputPath,
    });
    console.log(`Built Earth artifact: ${result.outputPath}`);
    console.log(`Build ID: ${result.manifest.buildId}`);
  } else if (command === "verify") {
    const artifactPath = requiredArgument(
      "--artifact",
      "Usage: earth build verify --artifact <sqlite>",
    );
    const result = verifyEarthArtifact(artifactPath);
    console.log(`Verified Earth artifact: ${result.manifest.buildId}`);
  } else {
    throw new Error("Usage: earth build <build|verify>");
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
