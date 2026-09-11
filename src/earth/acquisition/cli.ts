import {
  findEarthUniverseMember,
  loadEarthUniverse,
} from "../universe/earth-universe";
import {
  acquireEarthCellarSource,
  acquireEarthUniverse,
} from "./cellar-earth-source";
import {
  acquireEarthCellarRelations,
  readVerifiedEarthRelationSnapshot,
} from "./cellar-relation-source";
import { readVerifiedEarthSnapshot } from "./earth-snapshot";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function manifestFromArgument() {
  const path = argument("--universe");
  if (!path)
    throw new Error(
      "Usage: earth acquisition <list|fetch|relations:fetch> --universe <manifest.json>",
    );
  return loadEarthUniverse(path);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "list") {
    const manifest = await manifestFromArgument();
    console.table(
      manifest.members.map(({ celex, label }) => ({
        universe: manifest.id,
        celex,
        label,
      })),
    );
  } else if (command === "fetch") {
    const universe = await manifestFromArgument();
    const requestedCelex = argument("--celex");
    const member = requestedCelex
      ? findEarthUniverseMember(universe, requestedCelex)
      : undefined;
    if (requestedCelex && !member) {
      throw new Error(
        `CELEX ${requestedCelex} is not a member of Earth universe ${universe.id}`,
      );
    }
    const snapshots = member
      ? [await acquireEarthCellarSource(member.celex)]
      : await acquireEarthUniverse(universe);
    for (const { celex, directory, snapshot } of snapshots) {
      console.log(`Saved immutable Earth snapshot for ${celex}: ${directory}`);
      console.log(`Snapshot ID: ${snapshot.snapshotId}`);
    }
  } else if (command === "relations:fetch") {
    const universe = await manifestFromArgument();
    const result = await acquireEarthCellarRelations(universe);
    console.log(`Saved immutable Earth relation snapshot: ${result.directory}`);
    console.log(`Snapshot ID: ${result.snapshot.snapshotId}`);
    console.log(`Official relation records: ${result.records.length}`);
  } else if (command === "relations:verify") {
    const snapshotPath = argument("--snapshot");
    if (!snapshotPath) {
      throw new Error(
        "Usage: earth acquisition relations:verify --snapshot <snapshot-directory>",
      );
    }
    const result = await readVerifiedEarthRelationSnapshot(snapshotPath);
    console.log(
      `Verified Earth relation snapshot: ${result.snapshot.snapshotId}`,
    );
  } else if (command === "verify") {
    const snapshotPath = argument("--snapshot");
    if (!snapshotPath)
      throw new Error(
        "Usage: earth acquisition verify --snapshot <snapshot-directory>",
      );
    const { snapshot } = await readVerifiedEarthSnapshot(snapshotPath);
    console.log(`Verified Earth source snapshot: ${snapshot.snapshotId}`);
  } else {
    throw new Error(
      "Usage: earth acquisition <list|fetch|verify|relations:fetch|relations:verify>",
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
