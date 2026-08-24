import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CSSF_HTML_PARSER_VERSION, parseCssfHtml } from "./cssf-html-parser";
import { readVerifiedCssfSourceSnapshot } from "./cssf-snapshot";
import { findCssfSource } from "./cssf-source-registry";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function publishImmutableFile(
  path: string,
  content: string,
): Promise<void> {
  try {
    const existing = await readFile(path, "utf8");
    if (existing === content) return;
    throw new Error(
      `Refusing to overwrite a different immutable artifact: ${path}`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const pendingPath = `${path}.pending-${process.pid}`;
  await writeFile(pendingPath, content, { encoding: "utf8", flag: "wx" });
  await rename(pendingPath, path);
}

async function buildCssfCanonicalDocument(): Promise<void> {
  const snapshotPath = argument("--snapshot");
  if (!snapshotPath) {
    throw new Error(
      "Usage: npm run cssf:canonical:build -- --snapshot <snapshot-directory> [--output <directory>]",
    );
  }
  const verified = await readVerifiedCssfSourceSnapshot(snapshotPath);
  const source = await findCssfSource(verified.snapshot.localId);
  if (source.contentMediaType !== "text/html") {
    throw new Error(
      `CSSF canonical HTML build cannot parse ${source.localId}; ${source.contentMediaType} requires the PDF adapter`,
    );
  }
  const inspectOnly = process.argv.includes("--inspect");
  if (!inspectOnly && !source.quality) {
    throw new Error(
      `CSSF source ${source.localId} has no canonical quality baseline; run cssf:canonical:inspect first`,
    );
  }
  const { document, report } = parseCssfHtml(
    new TextDecoder().decode(verified.contentBytes),
    verified.snapshot,
    source,
  );
  const buildReport = {
    ...report,
    documentId: document.logicalId,
    sourceSnapshotId: document.sourceSnapshotId,
    sourceFiles: [verified.snapshot.content.file],
    parserVersion: CSSF_HTML_PARSER_VERSION,
    canonicalFile: "document.json",
  };

  if (inspectOnly) {
    console.table(buildReport);
    console.log(
      JSON.stringify(
        {
          sectionCount: report.sectionCount,
          blockCount: report.blockCount,
          maximumWarnings: report.warningCount,
          textHashes: Object.fromEntries(
            document.provisions
              .filter((provision) => provision.parentLogicalId)
              .slice(0, 1)
              .concat(
                document.provisions
                  .filter((provision) => provision.parentLogicalId)
                  .slice(-1),
              )
              .map((provision) => [provision.logicalId, provision.contentHash]),
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
      `data/artifacts/canonical/${source.localId}/${retrievalToken}-${sourceHash.slice(0, 12)}-parser-cssf-html-${CSSF_HTML_PARSER_VERSION}`,
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
  console.log(
    `Built CSSF canonical document: ${outputDirectory}/document.json`,
  );
  console.table(buildReport);
}

try {
  await buildCssfCanonicalDocument();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
