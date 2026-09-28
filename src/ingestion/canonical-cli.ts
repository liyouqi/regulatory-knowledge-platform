import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FORMEX_PARSER_VERSION } from "../canonical/versions";
import { extractFormexPackage } from "./formex-package";
import { parseFormexAct } from "./formex-parser";
import { prepareFormexResources } from "./formex-resources";
import { compareQualityBaseline } from "./quality-drift";
import { readVerifiedSourceSnapshot } from "./snapshot";
import { findSource } from "./source-registry";

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

async function buildCanonicalDocument(): Promise<void> {
  const snapshotPath = argument("--snapshot");
  if (!snapshotPath) {
    throw new Error(
      "Usage: npm run canonical:build -- --snapshot <snapshot-directory> [--output <directory>]",
    );
  }
  const verified = await readVerifiedSourceSnapshot(snapshotPath);
  const source = await findSource(verified.snapshot.celex);
  const inspectOnly = process.argv.includes("--inspect");
  const allowDrift = process.argv.includes("--allow-drift");
  if (!inspectOnly && !source.quality) {
    throw new Error(
      `CELEX ${source.celex} has no canonical quality baseline; run canonical:inspect first`,
    );
  }
  const formex = extractFormexPackage(
    verified.contentBytes,
    verified.snapshot.content.upstreamStreamName,
  );
  const resources = await prepareFormexResources(formex.resources);
  const { document, report } = parseFormexAct(
    formex.act.xml,
    inspectOnly || allowDrift ? { ...source, quality: undefined } : source,
    verified.snapshot,
    formex.annexes,
    resources,
  );
  const qualityDrift = compareQualityBaseline(document, report, source.quality);
  const sourceHash = verified.snapshot.content.sha256.slice(7);
  const qualityHash = createHash("sha256")
    .update(JSON.stringify(source.quality ?? null))
    .digest("hex")
    .slice(0, 12);
  const sourceStatusHash = createHash("sha256")
    .update(JSON.stringify(source.sourceStatus ?? null))
    .digest("hex")
    .slice(0, 12);
  if (inspectOnly) {
    const recitals = document.provisions.filter(
      (provision) => provision.kind === "recital",
    );
    const articles = document.provisions.filter(
      (provision) => provision.kind === "article",
    );
    const annexes = document.provisions.filter(
      (provision) => provision.kind === "annex",
    );
    const firstArticle = articles[0];
    const lastArticle = articles.at(-1);
    const firstArticleChild = firstArticle
      ? document.provisions.find(
          (candidate) => candidate.parentLogicalId === firstArticle.logicalId,
        )
      : undefined;
    const lastArticleChild = lastArticle
      ? document.provisions
          .filter(
            (candidate) => candidate.parentLogicalId === lastArticle.logicalId,
          )
          .at(-1)
      : undefined;
    const anchorHashes = [
      recitals[0],
      firstArticleChild ?? firstArticle,
      lastArticleChild ?? lastArticle,
      annexes[0],
      annexes.at(-1),
    ]
      .filter((provision) => provision !== undefined)
      .map((provision) => [provision.logicalId, provision.contentHash]);
    console.table(report);
    console.log(
      JSON.stringify(
        {
          articleCount: report.articleCount,
          recitalCount: report.recitalCount,
          annexCount: report.annexCount,
          paragraphCount: report.paragraphCount,
          pointCount: report.pointCount,
          structuralNodeCount: report.structuralNodeCount,
          maximumWarnings: report.warningCount,
          textHashes: Object.fromEntries(anchorHashes),
          qualityStatus: qualityDrift.length === 0 ? "matched" : "drifted",
          qualityDrift,
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
  const outputDirectory = resolve(
    process.cwd(),
    argument("--output") ??
      `data/artifacts/canonical/${source.celex}/${retrievalToken}-${sourceHash.slice(0, 12)}-status-${sourceStatusHash}${allowDrift ? `-refresh-quality-${qualityHash}` : ""}-parser-${FORMEX_PARSER_VERSION}`,
  );
  const buildReport = {
    ...report,
    documentId: document.logicalId,
    sourceSnapshotId: document.sourceSnapshotId,
    sourceFiles: [
      formex.act.fileName,
      ...formex.annexes.map(({ fileName }) => fileName),
      ...formex.resources.map(({ fileName }) => fileName),
    ],
    parserVersion: FORMEX_PARSER_VERSION,
    sourceStatusHash,
    canonicalFile: "document.json",
    ...(allowDrift
      ? {
          qualityStatus: qualityDrift.length === 0 ? "matched" : "drifted",
          qualityDrift,
        }
      : {}),
  };
  const documentJson = `${JSON.stringify(document, null, 2)}\n`;
  const reportJson = `${JSON.stringify(buildReport, null, 2)}\n`;

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    publishImmutableFile(`${outputDirectory}/document.json`, documentJson),
    publishImmutableFile(`${outputDirectory}/build-report.json`, reportJson),
  ]);

  console.log(`Built canonical document: ${outputDirectory}/document.json`);
  console.table(buildReport);
}

try {
  await buildCanonicalDocument();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
