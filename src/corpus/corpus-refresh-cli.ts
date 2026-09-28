import { spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { FORMEX_PARSER_VERSION } from "../canonical/versions";
import { loadDocumentViews } from "../data/document-repository";
import { CSSF_HTML_PARSER_VERSION } from "../ingestion/cssf-html-parser";
import { CSSF_PDF_PARSER_VERSION } from "../ingestion/cssf-pdf-parser";
import { loadCssfSourceRegistrySync } from "../ingestion/cssf-source-registry";
import { EBA_GUIDELINES_PDF_PARSER_VERSION } from "../ingestion/eba-guidelines-pdf-parser";
import { loadEbaSourceRegistrySync } from "../ingestion/eba-source-registry";
import type { QualityDrift } from "../ingestion/quality-drift";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import {
  findEditionProfile,
  loadEditionProfileRegistrySync,
} from "../runtime/edition-profile";
import {
  DEFAULT_RUNTIME_DATABASE_PATH,
  buildRuntimeDatabase,
} from "../search/sqlite-search-index";

type Adapter = "eur-lex" | "cssf" | "eba";

interface SnapshotSelection {
  adapter: Adapter;
  identifier: string;
  directory: string;
  snapshotId: string;
  retrievedAt: string;
}

interface CanonicalBuildReport {
  sourceSnapshotId?: string;
  parserVersion?: string;
  qualityStatus?: "matched" | "drifted";
  qualityDrift?: QualityDrift[];
}

function currentParserVersions(adapter: Adapter): ReadonlySet<string> {
  if (adapter === "eur-lex") return new Set([FORMEX_PARSER_VERSION]);
  if (adapter === "eba") {
    return new Set([EBA_GUIDELINES_PDF_PARSER_VERSION]);
  }
  return new Set([
    `html-${CSSF_HTML_PARSER_VERSION}`,
    `pdf-${CSSF_PDF_PARSER_VERSION}`,
  ]);
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function runTypeScript(script: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", script, ...args],
      {
        cwd: process.cwd(),
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else {
        reject(
          new Error(
            `${script} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
          ),
        );
      }
    });
  });
}

async function latestSnapshot(
  adapter: Adapter,
  identifier: string,
): Promise<SnapshotSelection> {
  const root = resolve(
    process.cwd(),
    "data/raw",
    adapter === "eur-lex" ? "eur-lex" : adapter,
    identifier,
  );
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No local snapshot found for ${adapter}:${identifier}`);
    }
    throw error;
  }
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const directory = resolve(root, entry.name);
        try {
          const snapshot = JSON.parse(
            await readFile(resolve(directory, "snapshot.json"), "utf8"),
          ) as { snapshotId?: unknown; retrievedAt?: unknown };
          if (
            typeof snapshot.snapshotId !== "string" ||
            typeof snapshot.retrievedAt !== "string"
          ) {
            return null;
          }
          return {
            adapter,
            identifier,
            directory,
            snapshotId: snapshot.snapshotId,
            retrievedAt: snapshot.retrievedAt,
          };
        } catch {
          return null;
        }
      }),
  );
  const latest = candidates
    .filter((candidate) => candidate !== null)
    .sort((left, right) =>
      right.retrievedAt.localeCompare(left.retrievedAt),
    )[0];
  if (!latest) {
    throw new Error(
      `No valid local snapshot found for ${adapter}:${identifier}`,
    );
  }
  return latest;
}

async function findCanonicalReport(
  selection: SnapshotSelection,
  strict: boolean,
): Promise<CanonicalBuildReport> {
  const root = resolve(
    process.cwd(),
    "data/artifacts/canonical",
    selection.identifier,
  );
  const entries = await readdir(root, { withFileTypes: true });
  const reports = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return JSON.parse(
            await readFile(
              resolve(root, entry.name, "build-report.json"),
              "utf8",
            ),
          ) as CanonicalBuildReport;
        } catch {
          return null;
        }
      }),
  );
  const parserVersions = currentParserVersions(selection.adapter);
  const report = reports.find(
    (candidate) =>
      candidate?.sourceSnapshotId === selection.snapshotId &&
      typeof candidate.parserVersion === "string" &&
      parserVersions.has(candidate.parserVersion) &&
      (strict
        ? candidate.qualityStatus === undefined
        : candidate.qualityStatus !== undefined),
  );
  if (report) return report;
  throw new Error(
    `Canonical build report missing for ${selection.adapter}:${selection.identifier}`,
  );
}

async function writeReport(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const pending = `${path}.pending-${process.pid}`;
  await writeFile(pending, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(pending, path);
}

async function refreshCorpus(): Promise<void> {
  const profileId = argument("--profile");
  if (process.argv.includes("--profile") && !profileId) {
    throw new Error(
      "Usage: npm run corpus:refresh -- [--profile <profile-id>] [--skip-fetch] [--strict]",
    );
  }
  const strict = process.argv.includes("--strict");
  const skipFetch = process.argv.includes("--skip-fetch");
  const eurLexSources = loadSourceRegistrySync();
  const cssfSources = loadCssfSourceRegistrySync();
  const ebaSources = loadEbaSourceRegistrySync();

  if (!skipFetch) {
    for (const source of eurLexSources) {
      await runTypeScript("src/ingestion/cli.ts", [
        "fetch",
        "--celex",
        source.celex,
      ]);
    }
    for (const source of cssfSources) {
      await runTypeScript("src/ingestion/cssf-cli.ts", [
        "fetch",
        "--id",
        source.localId,
      ]);
    }
    for (const source of ebaSources) {
      await runTypeScript("src/ingestion/eba-cli.ts", [
        "fetch",
        "--id",
        source.localId,
      ]);
    }
  }

  const selections = await Promise.all([
    ...eurLexSources.map((source) => latestSnapshot("eur-lex", source.celex)),
    ...cssfSources.map((source) => latestSnapshot("cssf", source.localId)),
    ...ebaSources.map((source) => latestSnapshot("eba", source.localId)),
  ]);
  for (const selection of selections) {
    const script =
      selection.adapter === "eur-lex"
        ? "src/ingestion/canonical-cli.ts"
        : selection.adapter === "cssf"
          ? "src/ingestion/cssf-canonical-cli.ts"
          : "src/ingestion/eba-canonical-cli.ts";
    await runTypeScript(script, [
      "--snapshot",
      selection.directory,
      ...(strict ? [] : ["--allow-drift"]),
    ]);
  }

  const profile = findEditionProfile(
    profileId,
    loadEditionProfileRegistrySync(),
  );
  const runtime = buildRuntimeDatabase(
    loadDocumentViews(),
    [...eurLexSources, ...cssfSources, ...ebaSources],
    DEFAULT_RUNTIME_DATABASE_PATH,
    profile,
    { reviewValidationMode: strict ? "strict" : "report" },
  );
  const sourceReports = await Promise.all(
    selections.map(async (selection) => {
      const canonical = await findCanonicalReport(selection, strict);
      return {
        adapter: selection.adapter,
        identifier: selection.identifier,
        snapshotId: selection.snapshotId,
        retrievedAt: selection.retrievedAt,
        qualityStatus: canonical.qualityStatus ?? "matched",
        qualityDrift: canonical.qualityDrift ?? [],
      };
    }),
  );
  const reportPath = resolve(
    process.cwd(),
    "data/artifacts/refresh/build-report.json",
  );
  await writeReport(reportPath, {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    mode: strict ? "strict" : "experimental-current",
    fetchedCurrentSources: !skipFetch,
    profileId: runtime.profileId,
    sources: sourceReports,
    runtime: {
      buildId: runtime.buildId,
      documentCount: runtime.documentCount,
      relationshipCount: runtime.relationshipCount,
      reviewedInputIssues: runtime.reviewedInputIssues,
      outputPath: runtime.outputPath,
    },
  });

  console.table({
    mode: strict ? "strict" : "experimental-current",
    profileId: runtime.profileId,
    sources: sourceReports.length,
    driftedSources: sourceReports.filter(
      (source) => source.qualityStatus === "drifted",
    ).length,
    omittedReviewedInputs: runtime.reviewedInputIssues.length,
    runtimeBuildId: runtime.buildId,
    runtimeDocuments: runtime.documentCount,
    runtimeRelationships: runtime.relationshipCount,
    runtimeArtifact: runtime.outputPath,
    report: reportPath,
  });
  if (runtime.reviewedInputIssues.length > 0) {
    console.warn("Reviewed mappings omitted from this experimental runtime:");
    console.table(runtime.reviewedInputIssues);
  }
}

try {
  await refreshCorpus();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
