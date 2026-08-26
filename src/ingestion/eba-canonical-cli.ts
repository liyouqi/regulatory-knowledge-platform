import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  EBA_GUIDELINES_PDF_PARSER_VERSION,
  parseEbaGuidelinesPdf,
} from "./eba-guidelines-pdf-parser";
import { readVerifiedEbaSourceSnapshot } from "./eba-snapshot";
import { findEbaSource } from "./eba-source-registry";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function publishImmutableFile(path: string, content: string) {
  try {
    const existing = await readFile(path, "utf8");
    if (existing === content) return;
    throw new Error(`Refusing to overwrite a different artifact: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pending = `${path}.pending-${process.pid}`;
  await writeFile(pending, content, { encoding: "utf8", flag: "wx" });
  await rename(pending, path);
}

async function build(): Promise<void> {
  const snapshotPath = argument("--snapshot");
  if (!snapshotPath) {
    throw new Error(
      "Usage: npm run eba:canonical:build -- --snapshot <snapshot-directory> [--output <directory>]",
    );
  }
  const verified = await readVerifiedEbaSourceSnapshot(snapshotPath);
  const source = await findEbaSource(verified.snapshot.localId);
  const inspectOnly = process.argv.includes("--inspect");
  if (!inspectOnly && !source.quality) {
    throw new Error(
      `EBA source ${source.localId} has no reviewed quality baseline; run eba:canonical:inspect first`,
    );
  }
  const { document, report } = await parseEbaGuidelinesPdf(
    verified.contentBytes,
    verified.snapshot,
    source,
  );
  const buildReport = {
    ...report,
    documentId: document.logicalId,
    sourceSnapshotId: document.sourceSnapshotId,
    sourceFiles: [verified.snapshot.content.file],
    parserVersion: EBA_GUIDELINES_PDF_PARSER_VERSION,
    canonicalFile: "document.json",
  };
  if (inspectOnly) {
    console.table(buildReport);
    const anchors = [
      `${source.documentId}:paragraph:5`,
      `${source.documentId}:paragraph:141`,
      `${source.documentId}:paragraph:234`,
      `${source.documentId}:annex:i`,
    ];
    console.log(
      JSON.stringify(
        {
          ...report,
          maximumWarnings: report.warningCount,
          textHashes: Object.fromEntries(
            anchors.map((id) => {
              const provision = document.provisions.find(
                (candidate) => candidate.logicalId === id,
              );
              if (!provision) throw new Error(`Missing inspect anchor ${id}`);
              return [id, provision.contentHash];
            }),
          ),
        },
        null,
        2,
      ),
    );
    return;
  }
  const retrievalToken = verified.snapshot.retrievedAt.replaceAll(
    /[-:.]/gu,
    "",
  );
  const sourceHash = verified.snapshot.content.sha256.slice(7);
  const outputDirectory = resolve(
    process.cwd(),
    argument("--output") ??
      `data/artifacts/canonical/${source.localId}/${retrievalToken}-${sourceHash.slice(0, 12)}-parser-eba-pdf-${EBA_GUIDELINES_PDF_PARSER_VERSION}`,
  );
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    publishImmutableFile(
      `${outputDirectory}/document.json`,
      `${JSON.stringify(document, null, 2)}\n`,
    ),
    publishImmutableFile(
      `${outputDirectory}/build-report.json`,
      `${JSON.stringify(buildReport, null, 2)}\n`,
    ),
  ]);
  console.log(`Built EBA canonical document: ${outputDirectory}/document.json`);
  console.table(buildReport);
}

try {
  await build();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
