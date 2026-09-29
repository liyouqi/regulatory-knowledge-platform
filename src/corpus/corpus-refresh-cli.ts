import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
import {
  type SourceDefinition,
  loadQueuedSourcesSync,
  loadSourceCatalogSync,
  loadSourceRegistrySync,
} from "../ingestion/source-registry";
import {
  findEditionProfile,
  loadEditionProfileRegistrySync,
} from "../runtime/edition-profile";
import { verifyRuntimeArtifact } from "../runtime/verify-runtime-artifact";
import {
  DEFAULT_RUNTIME_DATABASE_PATH,
  buildRuntimeDatabase,
} from "../search/sqlite-search-index";
import {
  CONSOLIDATED_EXPRESSION_AUDIT_VERSION,
  auditConsolidatedExpressions,
  parseConsolidatedExpressionCandidatesFromTreeNotice,
} from "./consolidated-expression-audit";
import { writeCorpusStatus } from "./corpus-status";

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
  sourceStatusHash?: string;
  sourceDefinitionHash?: string;
  qualityStatus?: "matched" | "drifted";
  qualityDrift?: QualityDrift[];
  qualityCandidate?: SourceDefinition["quality"];
}

interface OnboardingReport {
  celex: string;
  shortName: string;
  batch: string | null;
  status: "review-required" | "blocked";
  stage: "fetch" | "parse" | "review";
  snapshotId?: string;
  candidateArtifact?: string;
  qualityCandidate?: SourceDefinition["quality"];
  reason?: string;
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
    let outputTail = "";
    const appendOutput = (value: unknown) => {
      outputTail = `${outputTail}${String(value)}`.slice(-16_000);
    };
    const child = spawn(
      process.execPath,
      ["--import", "tsx", script, ...args],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout?.on("data", appendOutput);
    child.stderr?.on("data", appendOutput);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else {
        reject(
          new Error(
            `${script} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}${outputTail ? `\n${outputTail}` : ""}`,
          ),
        );
      }
    });
  });
}

async function buildConsolidatedExpressionAudit(
  sources: ReturnType<typeof loadSourceRegistrySync>,
  selections: SnapshotSelection[],
  freshOfficialCheck: boolean,
) {
  const selectionByIdentifier = new Map(
    selections
      .filter((selection) => selection.adapter === "eur-lex")
      .map((selection) => [selection.identifier, selection]),
  );
  const candidates = (
    await Promise.all(
      sources.map(async (source) => {
        const selection = selectionByIdentifier.get(source.celex);
        if (!selection) {
          throw new Error(`Missing selected snapshot for ${source.celex}`);
        }
        const treeNotice = await readFile(
          resolve(selection.directory, "tree-notice.xml"),
          "utf8",
        );
        const candidates = parseConsolidatedExpressionCandidatesFromTreeNotice(
          treeNotice,
          source.celex,
        );
        if (source.expressionCelex && source.sourceStatus) {
          candidates.push({
            celex: source.celex,
            expressionCelex: source.expressionCelex,
            effectiveDate: source.sourceStatus.textAsOf,
          });
        }
        return candidates;
      }),
    )
  ).flat();
  const asOf = new Date().toISOString().slice(0, 10);
  const entries = auditConsolidatedExpressions(sources, candidates, asOf);
  return {
    status: "completed" as const,
    builderVersion: CONSOLIDATED_EXPRESSION_AUDIT_VERSION,
    source: "verified-cellar-tree-notices" as const,
    freshOfficialCheck,
    asOf,
    current: entries.filter((entry) => entry.status === "current").length,
    reviewRequired: entries.filter(
      (entry) => entry.status === "review-required",
    ).length,
    noConsolidatedExpression: entries.filter(
      (entry) => entry.status === "no-consolidated-expression",
    ).length,
    entries,
  };
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
  qualityHash: string,
  sourceMetadataHash?: string,
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
          return {
            directoryName: entry.name,
            report: JSON.parse(
              await readFile(
                resolve(root, entry.name, "build-report.json"),
                "utf8",
              ),
            ) as CanonicalBuildReport,
          };
        } catch {
          return null;
        }
      }),
  );
  const parserVersions = currentParserVersions(selection.adapter);
  const candidate = reports.find(
    (candidate) =>
      candidate?.report.sourceSnapshotId === selection.snapshotId &&
      typeof candidate.report.parserVersion === "string" &&
      parserVersions.has(candidate.report.parserVersion) &&
      (selection.adapter === "eur-lex"
        ? candidate.report.sourceStatusHash === sourceMetadataHash
        : selection.adapter === "cssf"
          ? candidate.report.sourceDefinitionHash === sourceMetadataHash
          : true) &&
      (strict
        ? candidate.report.qualityStatus === undefined
        : candidate.report.qualityStatus !== undefined &&
          candidate.directoryName.includes(`-refresh-quality-${qualityHash}-`)),
  );
  if (candidate) return candidate.report;
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

async function processQueuedSources(
  sources: SourceDefinition[],
  skipFetch: boolean,
): Promise<OnboardingReport[]> {
  const reports: OnboardingReport[] = [];
  for (const source of sources) {
    let stage: OnboardingReport["stage"] = "fetch";
    try {
      if (!skipFetch) {
        await runTypeScript("src/ingestion/cli.ts", [
          "fetch",
          "--celex",
          source.celex,
          "--catalog",
        ]);
      }
      const selection = await latestSnapshot("eur-lex", source.celex);
      stage = "parse";
      const retrievalToken = selection.retrievedAt.replaceAll(/[-:.]/gu, "");
      const sourceHash = selection.snapshotId.split(":").at(-1)?.slice(0, 12);
      if (!sourceHash) {
        throw new Error(`Invalid snapshot ID: ${selection.snapshotId}`);
      }
      const outputDirectory = resolve(
        process.cwd(),
        "data/artifacts/onboarding/eur-lex",
        source.celex,
        `${retrievalToken}-${sourceHash}-parser-${FORMEX_PARSER_VERSION}`,
      );
      await runTypeScript("src/ingestion/canonical-cli.ts", [
        "--snapshot",
        selection.directory,
        "--catalog",
        "--allow-drift",
        "--output",
        outputDirectory,
      ]);
      const canonical = JSON.parse(
        await readFile(resolve(outputDirectory, "build-report.json"), "utf8"),
      ) as CanonicalBuildReport;
      if (!canonical.qualityCandidate) {
        throw new Error("Candidate build did not produce a quality baseline");
      }
      reports.push({
        celex: source.celex,
        shortName: source.shortName,
        batch: source.batch ?? null,
        status: "review-required",
        stage: "review",
        snapshotId: selection.snapshotId,
        candidateArtifact: outputDirectory,
        qualityCandidate: canonical.qualityCandidate,
      });
    } catch (error) {
      reports.push({
        celex: source.celex,
        shortName: source.shortName,
        batch: source.batch ?? null,
        status: "blocked",
        stage,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return reports;
}

async function refreshCorpus(): Promise<void> {
  const profileId = argument("--profile");
  const batch = argument("--batch");
  if (process.argv.includes("--profile") && !profileId) {
    throw new Error(
      "Usage: npm run corpus:update -- [--profile <profile-id>] [--batch <batch-id>] [--skip-fetch] [--strict]",
    );
  }
  if (process.argv.includes("--batch") && !batch) {
    throw new Error("Usage: npm run corpus:update -- [--batch <batch-id>]");
  }
  const strict = process.argv.includes("--strict");
  const skipFetch = process.argv.includes("--skip-fetch");
  const eurLexCatalog = loadSourceCatalogSync();
  if (batch && !eurLexCatalog.some((source) => source.batch === batch)) {
    throw new Error(`Unknown corpus batch: ${batch}`);
  }
  const eurLexSources = loadSourceRegistrySync();
  const selectedEurLexSources = batch
    ? eurLexSources.filter((source) => source.batch === batch)
    : eurLexSources;
  const queuedSources = loadQueuedSourcesSync().filter(
    (source) => !batch || source.batch === batch,
  );
  const cssfSources = loadCssfSourceRegistrySync();
  const ebaSources = loadEbaSourceRegistrySync();
  await writeCorpusStatus(eurLexCatalog, cssfSources, ebaSources);
  const selectedCssfSources = batch ? [] : cssfSources;
  const selectedEbaSources = batch ? [] : ebaSources;

  if (!skipFetch) {
    console.log(
      `Fetching ${selectedEurLexSources.length + selectedCssfSources.length + selectedEbaSources.length} active and ${queuedSources.length} queued official sources...`,
    );
    for (const source of selectedEurLexSources) {
      await runTypeScript("src/ingestion/cli.ts", [
        "fetch",
        "--celex",
        source.celex,
      ]);
    }
    for (const source of selectedCssfSources) {
      await runTypeScript("src/ingestion/cssf-cli.ts", [
        "fetch",
        "--id",
        source.localId,
      ]);
    }
    for (const source of selectedEbaSources) {
      await runTypeScript("src/ingestion/eba-cli.ts", [
        "fetch",
        "--id",
        source.localId,
      ]);
    }
  }

  const onboarding = await processQueuedSources(queuedSources, skipFetch);

  const selections = await Promise.all([
    ...eurLexSources.map((source) => latestSnapshot("eur-lex", source.celex)),
    ...cssfSources.map((source) => latestSnapshot("cssf", source.localId)),
    ...ebaSources.map((source) => latestSnapshot("eba", source.localId)),
  ]);
  const selectedIdentities = new Set([
    ...selectedEurLexSources.map((source) => `eur-lex:${source.celex}`),
    ...selectedCssfSources.map((source) => `cssf:${source.localId}`),
    ...selectedEbaSources.map((source) => `eba:${source.localId}`),
  ]);
  const buildSelections = selections.filter((selection) =>
    selectedIdentities.has(`${selection.adapter}:${selection.identifier}`),
  );
  const versionAudit = await buildConsolidatedExpressionAudit(
    eurLexSources,
    selections,
    !skipFetch,
  ).catch((error) => ({
    status: "unavailable" as const,
    reason: error instanceof Error ? error.message : String(error),
  }));
  console.log(`Building ${buildSelections.length} Canonical documents...`);
  for (const selection of buildSelections) {
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
  console.log("Building and verifying Runtime SQLite...");
  const runtime = buildRuntimeDatabase(
    loadDocumentViews(),
    [...eurLexSources, ...cssfSources, ...ebaSources],
    DEFAULT_RUNTIME_DATABASE_PATH,
    profile,
    { reviewValidationMode: strict ? "strict" : "report" },
  );
  const runtimeVerification = verifyRuntimeArtifact(runtime.outputPath);
  const reviewBySource = new Map<
    string,
    { quality: unknown; sourceMetadataHash?: string }
  >([
    ...eurLexSources.map(
      (source) =>
        [
          `eur-lex:${source.celex}`,
          {
            quality: source.quality,
            sourceMetadataHash: createHash("sha256")
              .update(JSON.stringify(source.sourceStatus ?? null))
              .digest("hex")
              .slice(0, 12),
          },
        ] as const,
    ),
    ...cssfSources.map(
      (source) =>
        [
          `cssf:${source.localId}`,
          {
            quality: source.quality ?? source.pdfQuality,
            sourceMetadataHash: createHash("sha256")
              .update(
                JSON.stringify({
                  ...source,
                  quality: undefined,
                  pdfQuality: undefined,
                }),
              )
              .digest("hex")
              .slice(0, 12),
          },
        ] as const,
    ),
    ...ebaSources.map(
      (source) =>
        [`eba:${source.localId}`, { quality: source.quality }] as const,
    ),
  ]);
  const sourceReports = await Promise.all(
    buildSelections.map(async (selection) => {
      const review = reviewBySource.get(
        `${selection.adapter}:${selection.identifier}`,
      );
      if (!review?.quality) {
        throw new Error(
          `Reviewed quality baseline missing for ${selection.adapter}:${selection.identifier}`,
        );
      }
      const qualityHash = createHash("sha256")
        .update(JSON.stringify(review.quality))
        .digest("hex")
        .slice(0, 12);
      const canonical = await findCanonicalReport(
        selection,
        strict,
        qualityHash,
        review.sourceMetadataHash,
      );
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
    schemaVersion: "1.2.0",
    generatedAt: new Date().toISOString(),
    mode: strict ? "strict" : "experimental-current",
    fetchedCurrentSources: !skipFetch,
    selectedBatch: batch ?? null,
    profileId: runtime.profileId,
    versionAudit,
    catalog: {
      active: eurLexSources.length,
      queued: queuedSources.length,
      planned: eurLexCatalog.filter((source) => source.status === "planned")
        .length,
    },
    onboarding,
    sources: sourceReports,
    runtime: {
      buildId: runtime.buildId,
      verified: runtimeVerification.buildId === runtime.buildId,
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
    versionAudit: versionAudit.status,
    currentExpressions:
      versionAudit.status === "completed" ? versionAudit.current : "unknown",
    expressionReviews:
      versionAudit.status === "completed"
        ? versionAudit.reviewRequired
        : "unknown",
    queuedSources: queuedSources.length,
    onboardingReady: onboarding.filter(
      (source) => source.status === "review-required",
    ).length,
    onboardingBlocked: onboarding.filter(
      (source) => source.status === "blocked",
    ).length,
    driftedSources: sourceReports.filter(
      (source) => source.qualityStatus === "drifted",
    ).length,
    omittedReviewedInputs: runtime.reviewedInputIssues.length,
    runtimeBuildId: runtime.buildId,
    runtimeVerified: runtimeVerification.buildId === runtime.buildId,
    runtimeDocuments: runtime.documentCount,
    runtimeRelationships: runtime.relationshipCount,
    runtimeArtifact: runtime.outputPath,
    report: reportPath,
  });
  if (runtime.reviewedInputIssues.length > 0) {
    console.warn("Reviewed mappings omitted from this experimental runtime:");
    console.table(runtime.reviewedInputIssues);
  }
  if (versionAudit.status === "unavailable") {
    console.warn(
      `Consolidated-expression audit unavailable: ${versionAudit.reason}`,
    );
  }
  if (versionAudit.status === "completed" && versionAudit.reviewRequired > 0) {
    console.warn(
      `${versionAudit.reviewRequired} consolidated-expression candidates require review; no registry, manifest, Runtime, or RAG selection was changed. See ${reportPath}.`,
    );
  }
}

try {
  await refreshCorpus();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
