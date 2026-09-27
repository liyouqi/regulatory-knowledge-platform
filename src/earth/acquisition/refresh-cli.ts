import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { metadataGraphSchema } from "../contract/metadata-graph";

async function run(script: string, args: string[] = []) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", script, ...args],
      { stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`${script} failed (${signal ?? code}).`)),
    );
  });
}

async function installedGraph() {
  const path = "data/artifacts/earth/graph.json";
  return existsSync(path)
    ? metadataGraphSchema.parse(JSON.parse(await readFile(path, "utf8")))
    : null;
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length &&
    !(
      args.length === 2 &&
      args[0] === "--resume" &&
      args[1].startsWith("data/raw/earth/graph/")
    )
  )
    throw new Error(
      "Usage: npm run earth:refresh [-- --resume data/raw/earth/graph/<snapshot>]",
    );
  if (!args.length) await run("src/earth/acquisition/census-cli.ts");
  else
    console.log(
      "Resume: reuse the graph snapshot's census and cached pages; no new census.",
    );
  await run("src/earth/acquisition/metadata-graph-cli.ts", args);
  await run("src/earth/build/inventory-cli.ts");
  const after = await installedGraph();
  if (!after) throw new Error("No completed Earth graph was published.");
  const frozenBaseline = JSON.parse(
    await readFile(`${after.source.rawDirectory}/baseline.json`, "utf8"),
  );
  const before = frozenBaseline
    ? metadataGraphSchema.parse(frozenBaseline)
    : null;
  const oldNodes = new Set(before?.nodes.map((node) => node.id));
  const oldEdges = new Set(before?.edges.map((edge) => edge.id));
  const newNodes = new Set(after.nodes.map((node) => node.id));
  const newEdges = new Set(after.edges.map((edge) => edge.id));
  const summary = {
    builtAt: after.builtAt,
    previousSnapshot: before?.source.snapshotHash ?? null,
    hasBaseline: Boolean(before),
    snapshot: after.source.snapshotHash,
    rawDirectory: after.source.rawDirectory,
    addedFiles: after.nodes
      .filter((node) => node.kind === "work" && !oldNodes.has(node.id))
      .map((node) => node.celex),
    removedFiles:
      before?.nodes
        .filter((node) => node.kind === "work" && !newNodes.has(node.id))
        .map((node) => node.celex) ?? [],
    addedRelations: after.edges.filter((edge) => !oldEdges.has(edge.id)).length,
    removedRelations:
      before?.edges.filter((edge) => !newEdges.has(edge.id)).length ?? 0,
    scopeWorks: after.report.scopeWorks,
    changedFamilyAssignments: before
      ? after.nodes
          .filter((node) => {
            const previous = before.nodes.find((old) => old.id === node.id);
            return (
              previous &&
              [...previous.families].sort().join("|") !==
                [...node.families].sort().join("|")
            );
          })
          .map((node) => ({ id: node.id, families: node.families }))
      : null,
    relatedWorks: after.report.boundaryWorks,
    familyReport: "docs/earth/earth-families.md",
    language: "ENG",
    modelCalls: 0,
  };
  await mkdir("data/artifacts/earth", { recursive: true });
  await writeFile(
    "data/artifacts/earth/refresh-report.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
