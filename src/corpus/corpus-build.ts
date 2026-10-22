import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { z } from "zod";
import { FORMEX_PARSER_VERSION } from "../canonical/versions";
import { loadDocumentViews } from "../data/document-repository";
import { AMF_HTML_PARSER_VERSION } from "../ingestion/amf-canonical-parser";
import { readVerifiedAmfSourceSnapshot } from "../ingestion/amf-snapshot";
import {
  type AmfSourceDefinition,
  loadAmfSourceRegistrySync,
} from "../ingestion/amf-source-registry";
import { CSSF_HTML_PARSER_VERSION } from "../ingestion/cssf-html-parser";
import { CSSF_PDF_PARSER_VERSION } from "../ingestion/cssf-pdf-parser";
import { readVerifiedCssfSourceSnapshot } from "../ingestion/cssf-snapshot";
import {
  type CssfSourceDefinition,
  loadCssfSourceRegistrySync,
} from "../ingestion/cssf-source-registry";
import { EBA_GUIDELINES_PDF_PARSER_VERSION } from "../ingestion/eba-guidelines-pdf-parser";
import { readVerifiedEbaSourceSnapshot } from "../ingestion/eba-snapshot";
import {
  type EbaSourceDefinition,
  loadEbaSourceRegistrySync,
} from "../ingestion/eba-source-registry";
import { readVerifiedNationalSourceSnapshot } from "../ingestion/national-snapshot";
import {
  type NationalSourceDefinition,
  loadNationalSourceRegistrySync,
} from "../ingestion/national-source-registry";
import { NATIONAL_XML_PARSER_VERSION } from "../ingestion/national-xml-parser";
import { readVerifiedSourceSnapshot } from "../ingestion/snapshot";
import {
  type SourceDefinition,
  loadSourceRegistrySync,
} from "../ingestion/source-registry";
import {
  findEditionProfile,
  loadEditionProfileRegistrySync,
} from "../runtime/edition-profile";
import { verifyRuntimeArtifact } from "../runtime/verify-runtime-artifact";
import { buildRuntimeDatabase } from "../search/sqlite-search-index";

export const CORPUS_BUILD_MANIFEST_SCHEMA_VERSION = "1.0.0";
export const DEFAULT_CORPUS_BUILD_MANIFEST_PATH = resolve(
  process.cwd(),
  "data/corpus-build-manifest.json",
);

const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const relativeInputPathSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.split("/").some((segment) => segment === ".."),
    "Reviewed input paths must stay inside the repository",
  );
const retentionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("local-only") }).strict(),
  z
    .object({
      status: z.literal("archived"),
      uri: z.string().regex(/^(?:gs|s3|https):\/\/.+/u),
    })
    .strict(),
]);

export const corpusBuildSourceSchema = z
  .object({
    adapter: z.enum(["eur-lex", "cssf", "eba", "national", "amf"]),
    identifier: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/u),
    snapshotId: z.string().startsWith("snapshot:"),
    contentSha256: sha256Schema,
    retention: retentionSchema,
  })
  .strict();

export const corpusBuildManifestSchema = z
  .object({
    schemaVersion: z.literal(CORPUS_BUILD_MANIFEST_SCHEMA_VERSION),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    sources: z.array(corpusBuildSourceSchema).min(1),
    requiredReviewedInputs: z.array(relativeInputPathSchema),
  })
  .strict()
  .superRefine((manifest, context) => {
    const identities = new Set<string>();
    const snapshotIds = new Set<string>();
    for (const [index, source] of manifest.sources.entries()) {
      const identity = `${source.adapter}:${source.identifier}`;
      if (identities.has(identity)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate corpus source ${identity}`,
          path: ["sources", index],
        });
      }
      if (snapshotIds.has(source.snapshotId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate corpus snapshot ${source.snapshotId}`,
          path: ["sources", index, "snapshotId"],
        });
      }
      identities.add(identity);
      snapshotIds.add(source.snapshotId);
    }
    if (
      new Set(manifest.requiredReviewedInputs).size !==
      manifest.requiredReviewedInputs.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reviewed input paths must not contain duplicates",
        path: ["requiredReviewedInputs"],
      });
    }
  });

export type CorpusBuildManifest = z.infer<typeof corpusBuildManifestSchema>;
export type CorpusBuildSource = z.infer<typeof corpusBuildSourceSchema>;

export interface CorpusBuildOptions {
  manifestPath?: string;
  profileId?: string;
  outputDirectory?: string;
  requireArchived?: boolean;
}

interface RegisteredCorpusSource {
  definition:
    | SourceDefinition
    | CssfSourceDefinition
    | EbaSourceDefinition
    | NationalSourceDefinition
    | AmfSourceDefinition;
  manifest: CorpusBuildSource;
  parserVersion: string;
}

interface ResolvedCorpusSource extends RegisteredCorpusSource {
  snapshotPath: string;
}

interface CorpusBuildReport {
  schemaVersion: "1.0.0";
  status: "succeeded" | "failed";
  buildRequestHash: string;
  manifest: {
    id: string;
    version: string;
    hash: string;
  };
  profile: {
    id: string;
    version: string;
  };
  archiveGate: {
    required: boolean;
    archivedSources: number;
    localOnlySources: number;
  };
  reviewedInputs: Array<{
    path: string;
    status: "verified" | "missing";
    sha256?: string;
  }>;
  sources: Array<{
    adapter: CorpusBuildSource["adapter"];
    identifier: string;
    snapshotId: string;
    contentSha256: string;
    parserVersion: string;
    retentionStatus: "local-only" | "archived";
    status: "pending" | "built" | "failed";
  }>;
  runtime?: {
    buildId: string;
    profileId: string;
    profileHash: string;
    documents: number;
    records: number;
    definitions: number;
    relationships: number;
    bytes: number;
    artifact: string;
  };
  error?: string;
}

function hashBytes(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function corpusBuildManifestHash(manifest: CorpusBuildManifest): string {
  return hashBytes(JSON.stringify(corpusBuildManifestSchema.parse(manifest)));
}

export function loadCorpusBuildManifest(
  manifestPath = DEFAULT_CORPUS_BUILD_MANIFEST_PATH,
): CorpusBuildManifest {
  return corpusBuildManifestSchema.parse(
    JSON.parse(readFileSync(resolve(manifestPath), "utf8")),
  );
}

function snapshotDirectories(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const path = resolve(root, entry.name);
    if (existsSync(resolve(path, "snapshot.json"))) return [path];
    return snapshotDirectories(path);
  });
}

export function selectManifestSnapshotPath(
  source: CorpusBuildSource,
  matches: string[],
): string {
  const selected = [...matches].sort()[0];
  if (!selected) {
    throw new Error(
      `Expected a local snapshot for ${source.adapter}:${source.identifier} (${source.snapshotId}), found 0`,
    );
  }
  return selected;
}

function findSnapshotPath(source: CorpusBuildSource): string {
  const baseRoot = resolve(
    process.cwd(),
    source.adapter === "eur-lex"
      ? "data/raw/eur-lex"
      : source.adapter === "cssf"
        ? "data/raw/cssf"
        : source.adapter === "eba"
          ? "data/raw/eba"
          : source.adapter === "amf"
            ? "data/raw/amf-snapshots"
            : "data/raw/national",
  );
  const root =
    source.adapter === "amf" ? baseRoot : resolve(baseRoot, source.identifier);
  const matches = snapshotDirectories(root).filter((directory) => {
    const value = JSON.parse(
      readFileSync(resolve(directory, "snapshot.json"), "utf8"),
    ) as { snapshotId?: string };
    return value.snapshotId === source.snapshotId;
  });
  return selectManifestSnapshotPath(source, matches);
}

function assertExactCoverage(
  manifest: CorpusBuildManifest,
  euSources: SourceDefinition[],
  cssfSources: CssfSourceDefinition[],
  ebaSources: EbaSourceDefinition[],
  nationalSources: NationalSourceDefinition[],
  amfSources: AmfSourceDefinition[] = loadAmfSourceRegistrySync().filter(
    (s) => s.status === "active",
  ),
): void {
  const expected = new Set([
    ...euSources.map((source) => `eur-lex:${source.celex}`),
    ...cssfSources.map((source) => `cssf:${source.localId}`),
    ...ebaSources.map((source) => `eba:${source.localId}`),
    ...nationalSources.map((source) => `national:${source.localId}`),
    ...amfSources.map((source) => `amf:${source.localId}`),
  ]);
  const actual = new Set(
    manifest.sources.map((source) => `${source.adapter}:${source.identifier}`),
  );
  const missing = [...expected].filter((identity) => !actual.has(identity));
  const unexpected = [...actual].filter((identity) => !expected.has(identity));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Corpus manifest differs from source registries: missing [${missing.join(", ")}], unexpected [${unexpected.join(", ")}]`,
    );
  }
}

function assertExactCanonicalDocuments(
  documents: ReturnType<typeof loadDocumentViews>,
  sources: ResolvedCorpusSource[],
): void {
  if (documents.some((document) => document.provenance !== "official")) {
    throw new Error("Staging Canonical corpus contains a fixture");
  }
  const expected = new Set(
    sources.map((source) =>
      source.manifest.adapter === "eur-lex"
        ? `eu:${source.manifest.identifier}`
        : source.manifest.adapter === "cssf"
          ? `lu:cssf:${source.manifest.identifier}`
          : source.manifest.adapter === "eba"
            ? (source.definition as EbaSourceDefinition).documentId
            : (source.definition as NationalSourceDefinition).documentId,
    ),
  );
  const actual = new Set(documents.map((document) => document.id));
  const missing = [...expected].filter((id) => !actual.has(id));
  const unexpected = [...actual].filter((id) => !expected.has(id));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Staging Canonical corpus differs from manifest: missing [${missing.join(", ")}], unexpected [${unexpected.join(", ")}]`,
    );
  }
}

function parserVersion(
  source: CorpusBuildSource,
  definition:
    | SourceDefinition
    | CssfSourceDefinition
    | EbaSourceDefinition
    | NationalSourceDefinition
    | AmfSourceDefinition,
): string {
  if (source.adapter === "eur-lex") return FORMEX_PARSER_VERSION;
  if (source.adapter === "national")
    return `national-xml-${NATIONAL_XML_PARSER_VERSION}`;
  if (source.adapter === "eba") {
    return `eba-pdf-${EBA_GUIDELINES_PDF_PARSER_VERSION}`;
  }
  if (source.adapter === "amf") return `amf-html-${AMF_HTML_PARSER_VERSION}`;
  const cssf = definition as CssfSourceDefinition;
  return cssf.contentMediaType === "text/html"
    ? `cssf-html-${CSSF_HTML_PARSER_VERSION}`
    : `cssf-pdf-${CSSF_PDF_PARSER_VERSION}`;
}

export function validateCorpusBuildManifestSources(
  manifest: CorpusBuildManifest,
): RegisteredCorpusSource[] {
  const euSources = loadSourceRegistrySync();
  const cssfSources = loadCssfSourceRegistrySync();
  const ebaSources = loadEbaSourceRegistrySync();
  const nationalSources = loadNationalSourceRegistrySync();
  const amfSources = loadAmfSourceRegistrySync().filter(
    (source) => source.status === "active",
  );
  assertExactCoverage(
    manifest,
    euSources,
    cssfSources,
    ebaSources,
    nationalSources,
    amfSources,
  );

  return manifest.sources.map((source) => {
    const definition =
      source.adapter === "eur-lex"
        ? euSources.find((candidate) => candidate.celex === source.identifier)
        : source.adapter === "cssf"
          ? cssfSources.find(
              (candidate) => candidate.localId === source.identifier,
            )
          : source.adapter === "eba"
            ? ebaSources.find(
                (candidate) => candidate.localId === source.identifier,
              )
            : source.adapter === "amf"
              ? amfSources.find(
                  (candidate) => candidate.localId === source.identifier,
                )
              : nationalSources.find(
                  (candidate) => candidate.localId === source.identifier,
                );
    if (!definition) {
      throw new Error(`Source is not registered: ${source.identifier}`);
    }
    const quality =
      source.adapter === "eur-lex"
        ? (definition as SourceDefinition).quality
        : source.adapter === "amf"
          ? (definition as AmfSourceDefinition).quality
          : source.adapter === "national"
            ? (definition as NationalSourceDefinition).quality
            : source.adapter === "eba"
              ? (definition as EbaSourceDefinition).quality
              : (definition as CssfSourceDefinition).contentMediaType ===
                  "text/html"
                ? (definition as CssfSourceDefinition).quality
                : (definition as CssfSourceDefinition).pdfQuality;
    if (!quality) {
      throw new Error(
        `Source has no reviewed quality baseline: ${source.identifier}`,
      );
    }
    return {
      definition,
      manifest: source,
      parserVersion: parserVersion(source, definition),
    };
  });
}

export function assertCorpusSnapshotChecksum(
  identifier: string,
  actual: string,
  expected: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `Snapshot checksum differs from corpus manifest: ${identifier}`,
    );
  }
}

export async function resolveCorpusBuildSources(
  manifest: CorpusBuildManifest,
  requireArchived = false,
): Promise<ResolvedCorpusSource[]> {
  const resolvedSources: ResolvedCorpusSource[] = [];
  for (const registered of validateCorpusBuildManifestSources(manifest)) {
    const source = registered.manifest;
    if (requireArchived && source.retention.status !== "archived") {
      throw new Error(
        `Snapshot archive gate failed for ${source.adapter}:${source.identifier}`,
      );
    }
    const snapshotPath = findSnapshotPath(source);
    const verified =
      source.adapter === "eur-lex"
        ? await readVerifiedSourceSnapshot(snapshotPath)
        : source.adapter === "cssf"
          ? await readVerifiedCssfSourceSnapshot(snapshotPath)
          : source.adapter === "eba"
            ? await readVerifiedEbaSourceSnapshot(snapshotPath)
            : source.adapter === "amf"
              ? await readVerifiedAmfSourceSnapshot(snapshotPath)
              : await readVerifiedNationalSourceSnapshot(snapshotPath);
    assertCorpusSnapshotChecksum(
      source.identifier,
      verified.snapshot.content.sha256,
      source.contentSha256,
    );
    resolvedSources.push({
      ...registered,
      snapshotPath,
    });
  }
  return resolvedSources;
}

function runCanonicalBuilder(source: ResolvedCorpusSource, outputPath: string) {
  const script =
    source.manifest.adapter === "eur-lex"
      ? "src/ingestion/canonical-cli.ts"
      : source.manifest.adapter === "cssf"
        ? "src/ingestion/cssf-canonical-cli.ts"
        : source.manifest.adapter === "eba"
          ? "src/ingestion/eba-canonical-cli.ts"
          : source.manifest.adapter === "amf"
            ? "src/ingestion/amf-canonical-cli.ts"
            : "src/ingestion/national-canonical-cli.ts";
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      script,
      ...(source.manifest.adapter === "amf" ? ["build"] : []),
      "--snapshot",
      source.snapshotPath,
      "--output",
      outputPath,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      (
        result.stderr ||
        result.stdout ||
        `Canonical builder failed for ${source.manifest.identifier}`
      ).trim(),
    );
  }
}

function writeReport(path: string, report: CorpusBuildReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function buildCorpus(
  options: CorpusBuildOptions = {},
): Promise<CorpusBuildReport> {
  const manifest = loadCorpusBuildManifest(options.manifestPath);
  const manifestHash = corpusBuildManifestHash(manifest);
  const profile = findEditionProfile(
    options.profileId,
    loadEditionProfileRegistrySync(),
  );
  const reviewedInputs = manifest.requiredReviewedInputs.map((path) => {
    const absolutePath = resolve(process.cwd(), path);
    return existsSync(absolutePath)
      ? {
          path,
          status: "verified" as const,
          sha256: hashBytes(readFileSync(absolutePath)),
        }
      : { path, status: "missing" as const };
  });
  const buildRequestHash = hashBytes(
    JSON.stringify({
      manifestHash,
      profile: { id: profile.id, version: profile.version },
      reviewedInputs,
      builders: {
        formex: FORMEX_PARSER_VERSION,
        cssfHtml: CSSF_HTML_PARSER_VERSION,
        cssfPdf: CSSF_PDF_PARSER_VERSION,
        ebaPdf: EBA_GUIDELINES_PDF_PARSER_VERSION,
        nationalXml: NATIONAL_XML_PARSER_VERSION,
        amfHtml: AMF_HTML_PARSER_VERSION,
      },
    }),
  );
  const defaultOutput = resolve(
    process.cwd(),
    "data/artifacts/corpus-builds",
    `${manifest.id}-${buildRequestHash.slice(7, 19)}-${profile.id}`,
  );
  const outputDirectory = resolve(options.outputDirectory ?? defaultOutput);
  const canonicalRoot = resolve(outputDirectory, "canonical");
  const runtimePath = resolve(outputDirectory, "runtime.sqlite");
  const reportPath = resolve(outputDirectory, "build-report.json");
  const report: CorpusBuildReport = {
    schemaVersion: "1.0.0",
    status: "failed",
    buildRequestHash,
    manifest: {
      id: manifest.id,
      version: manifest.version,
      hash: manifestHash,
    },
    profile: { id: profile.id, version: profile.version },
    archiveGate: {
      required: options.requireArchived ?? false,
      archivedSources: manifest.sources.filter(
        (source) => source.retention.status === "archived",
      ).length,
      localOnlySources: manifest.sources.filter(
        (source) => source.retention.status === "local-only",
      ).length,
    },
    reviewedInputs,
    sources: manifest.sources.map((source) => ({
      adapter: source.adapter,
      identifier: source.identifier,
      snapshotId: source.snapshotId,
      contentSha256: source.contentSha256,
      parserVersion: "pending",
      retentionStatus: source.retention.status,
      status: "pending",
    })),
  };

  try {
    const missingInput = reviewedInputs.find(
      (input) => input.status === "missing",
    );
    if (missingInput) {
      throw new Error(
        `Required reviewed input is missing: ${missingInput.path}`,
      );
    }
    const sources = await resolveCorpusBuildSources(
      manifest,
      options.requireArchived,
    );
    for (const source of sources) {
      const sourceReport = report.sources.find(
        (candidate) =>
          candidate.adapter === source.manifest.adapter &&
          candidate.identifier === source.manifest.identifier,
      );
      if (!sourceReport) throw new Error("Corpus source report mismatch");
      sourceReport.parserVersion = source.parserVersion;
      const parserSuffix = `parser-${source.parserVersion}`;
      const canonicalOutput = resolve(
        canonicalRoot,
        source.manifest.identifier,
        `${source.manifest.contentSha256.slice(7, 19)}-${parserSuffix}`,
      );
      try {
        runCanonicalBuilder(source, canonicalOutput);
        sourceReport.status = "built";
      } catch (error) {
        sourceReport.status = "failed";
        throw error;
      }
    }

    const documents = loadDocumentViews(canonicalRoot);
    assertExactCanonicalDocuments(documents, sources);
    const runtimeSources = [
      ...loadSourceRegistrySync(),
      ...loadCssfSourceRegistrySync(),
      ...loadEbaSourceRegistrySync(),
      ...loadNationalSourceRegistrySync(),
      ...loadAmfSourceRegistrySync().filter(
        (source) => source.status === "active",
      ),
    ];
    buildRuntimeDatabase(documents, runtimeSources, runtimePath, profile);
    const verification = verifyRuntimeArtifact(runtimePath);
    report.status = "succeeded";
    report.runtime = {
      buildId: verification.buildId,
      profileId: verification.profileId,
      profileHash: verification.profileHash,
      documents: verification.documents,
      records: verification.records,
      definitions: verification.definitions,
      relationships: verification.relationships,
      bytes: verification.bytes,
      artifact: relative(process.cwd(), runtimePath),
    };
    writeReport(reportPath, report);
    return report;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    writeReport(reportPath, report);
    throw error;
  }
}
