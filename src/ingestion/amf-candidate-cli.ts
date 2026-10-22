import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectAmfCandidate } from "./amf-candidate-parser";

export async function writeAmfCandidate(inputPath: string, outputPath: string) {
  const output = resolve(outputPath);
  const artifactPath = relative(resolve("data/artifacts"), output);
  if (
    !artifactPath ||
    isAbsolute(artifactPath) ||
    artifactPath.split(/[\\/]/u).includes("..")
  )
    throw new Error("AMF candidates must stay under ignored data/artifacts");
  const candidate = inspectAmfCandidate(await readFile(inputPath));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(candidate, null, 2)}\n`, {
    flag: "wx",
  });
  return candidate;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--output")
    throw new Error(
      "Usage: amf:candidate:inspect -- --input <HTML> --output <data/artifacts/file.json>",
    );
  const candidate = await writeAmfCandidate(args[1], args[3]);
  console.log(
    JSON.stringify(
      {
        status: candidate.status,
        versionDate: candidate.baseline.source.versionDate,
        groups: candidate.baseline.groups.length,
        articles: candidate.baseline.articles.length,
        sourceNotes: candidate.baseline.notes.length,
        inputSha256: candidate.baseline.input.sha256,
        legalContentAstHash: candidate.legalContentAstHash,
        output: args[3],
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
