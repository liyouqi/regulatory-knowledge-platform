import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  CELLAR_LIFECYCLE_QUERY_VERSION,
  cellarLifecyclePredicateSchema,
} from "../../ingestion/cellar-lifecycle-relations";
import {
  CELLAR_SPARQL_ENDPOINT,
  cellarCelexFromUri,
  officialCellarWorkUri,
} from "../../ingestion/cellar-relations";
import type { EarthUniverse } from "../universe/earth-universe";

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;
const RELATION_QUERY_VERSION = `earth-lifecycle-title-optional@1.1.0+${CELLAR_LIFECYCLE_QUERY_VERSION}`;
const celexSchema = z.string().regex(/^[0-9][0-9A-Z()_-]{4,39}$/u);

export const earthCellarRelationRecordSchema = z
  .object({
    sourceCelex: celexSchema,
    sourceWorkUri: z.string().url(),
    sourceTitle: z.string().min(1).optional(),
    predicate: cellarLifecyclePredicateSchema,
    targetCelex: celexSchema,
    targetWorkUri: z.string().url(),
    targetTitle: z.string().min(1).optional(),
  })
  .strict();

export type EarthCellarRelationRecord = z.infer<
  typeof earthCellarRelationRecordSchema
>;

export const earthCellarRelationSnapshotSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    snapshotId: z.string().regex(/^earth:cellar-relations:[a-f0-9]{64}$/u),
    provenance: z.literal("official"),
    sourceSystem: z.literal("cellar-sparql"),
    queryVersion: z.literal(RELATION_QUERY_VERSION),
    endpoint: z.literal(CELLAR_SPARQL_ENDPOINT),
    retrievedAt: z.string().datetime(),
    seedCelexes: z.array(celexSchema).min(1),
    querySha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    responseSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    normalizedSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    recordCount: z.number().int().nonnegative(),
    files: z
      .object({
        query: z.literal("query.rq"),
        response: z.literal("response.json"),
        normalized: z.literal("normalized.json"),
      })
      .strict(),
  })
  .strict();

export type EarthCellarRelationSnapshot = z.infer<
  typeof earthCellarRelationSnapshotSchema
>;

const sparqlUriSchema = z.object({
  type: z.literal("uri"),
  value: z.string().url(),
});
const sparqlLiteralSchema = z.object({
  type: z.literal("literal"),
  value: z.string().min(1),
});
const sparqlResponseSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        source: sparqlUriSchema,
        sourceCelexUri: sparqlUriSchema,
        sourceTitle: sparqlLiteralSchema.optional(),
        predicate: sparqlUriSchema,
        target: sparqlUriSchema,
        targetCelexUri: sparqlUriSchema,
        targetTitle: sparqlLiteralSchema.optional(),
      }),
    ),
  }),
});

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function relationKey(record: EarthCellarRelationRecord): string {
  return [record.sourceCelex, record.predicate, record.targetCelex].join("|");
}

function normalizeSeeds(values: string[]): string[] {
  return [...new Set(values.map((value) => celexSchema.parse(value)))].sort();
}

export function buildEarthCellarRelationQuery(seedValues: string[]): string {
  const seeds = normalizeSeeds(seedValues);
  if (seeds.length === 0)
    throw new Error("Earth relation query requires a CELEX seed");
  const seedIris = seeds
    .map((celex) => `<http://publications.europa.eu/resource/celex/${celex}>`)
    .join(" ");
  const predicateIris = cellarLifecyclePredicateSchema.options
    .map((predicate) => `<${predicate}>`)
    .join(" ");
  return [
    "PREFIX owl: <http://www.w3.org/2002/07/owl#>",
    "PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>",
    "SELECT DISTINCT ?source ?sourceCelexUri ?sourceTitle ?predicate ?target ?targetCelexUri ?targetTitle",
    "WHERE {",
    `  VALUES ?seedCelexUri { ${seedIris} }`,
    `  VALUES ?predicate { ${predicateIris} }`,
    "  {",
    "    ?source owl:sameAs ?seedCelexUri .",
    "    ?source ?predicate ?target .",
    "  } UNION {",
    "    ?target owl:sameAs ?seedCelexUri .",
    "    ?source ?predicate ?target .",
    "  }",
    "  ?source owl:sameAs ?sourceCelexUri .",
    "  ?target owl:sameAs ?targetCelexUri .",
    "  OPTIONAL {",
    "    ?sourceExpression cdm:expression_belongs_to_work ?source ;",
    "      cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> ;",
    "      cdm:expression_title ?sourceTitle .",
    "  }",
    "  OPTIONAL {",
    "    ?targetExpression cdm:expression_belongs_to_work ?target ;",
    "      cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> ;",
    "      cdm:expression_title ?targetTitle .",
    "  }",
    '  FILTER(STRSTARTS(STR(?sourceCelexUri), "http://publications.europa.eu/resource/celex/"))',
    '  FILTER(STRSTARTS(STR(?targetCelexUri), "http://publications.europa.eu/resource/celex/"))',
    "  FILTER(?sourceCelexUri != ?targetCelexUri)",
    "}",
    "ORDER BY ?sourceCelexUri ?predicate ?targetCelexUri",
  ].join("\n");
}

export function parseEarthCellarRelationResults(
  raw: unknown,
  seedValues: string[],
): EarthCellarRelationRecord[] {
  const seeds = new Set(normalizeSeeds(seedValues));
  const unique = new Map<string, EarthCellarRelationRecord>();
  for (const binding of sparqlResponseSchema.parse(raw).results.bindings) {
    const record = earthCellarRelationRecordSchema.parse({
      sourceCelex: cellarCelexFromUri(binding.sourceCelexUri.value),
      sourceWorkUri: officialCellarWorkUri(binding.source.value),
      ...(binding.sourceTitle
        ? { sourceTitle: binding.sourceTitle.value }
        : {}),
      predicate: binding.predicate.value,
      targetCelex: cellarCelexFromUri(binding.targetCelexUri.value),
      targetWorkUri: officialCellarWorkUri(binding.target.value),
      ...(binding.targetTitle
        ? { targetTitle: binding.targetTitle.value }
        : {}),
    });
    if (!seeds.has(record.sourceCelex) && !seeds.has(record.targetCelex)) {
      throw new Error(
        `Earth relation is outside the seed neighbourhood: ${relationKey(record)}`,
      );
    }
    if (record.sourceCelex === record.targetCelex) {
      throw new Error(
        `Earth relation cannot target itself: ${relationKey(record)}`,
      );
    }
    const key = relationKey(record);
    const existing = unique.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new Error(`Conflicting Earth relation metadata: ${key}`);
    }
    unique.set(key, record);
  }
  return [...unique.values()].sort((left, right) =>
    relationKey(left).localeCompare(relationKey(right)),
  );
}

export interface EarthRelationAcquisitionOptions {
  outputRoot?: string;
  fetchImplementation?: typeof fetch;
  now?: () => Date;
}

export interface EarthRelationAcquisitionResult {
  directory: string;
  snapshot: EarthCellarRelationSnapshot;
  records: EarthCellarRelationRecord[];
}

async function fetchOfficialRelations(
  query: string,
  fetchImplementation: typeof fetch,
): Promise<Uint8Array> {
  const response = await fetchImplementation(CELLAR_SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json, application/json",
      "Content-Type": "application/sparql-query; charset=utf-8",
      "User-Agent":
        "regulatory-knowledge-platform-earth/0.2 (build-time acquisition)",
    },
    body: query,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`CELLAR SPARQL returned HTTP ${response.status}`);
  const resolved = new URL(response.url);
  if (
    resolved.protocol !== "https:" ||
    resolved.hostname !== "publications.europa.eu"
  ) {
    throw new Error(
      `CELLAR SPARQL resolved outside the official host: ${response.url}`,
    );
  }
  const mediaType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!mediaType.includes("json")) {
    throw new Error(
      `CELLAR SPARQL returned unexpected media type: ${mediaType || "missing"}`,
    );
  }
  const declaredBytes = Number(response.headers.get("content-length") ?? "0");
  if (declaredBytes > MAX_RESPONSE_BYTES)
    throw new Error("CELLAR relation response is too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES)
    throw new Error("CELLAR relation response is too large");
  return bytes;
}

export async function acquireEarthCellarRelations(
  universe: EarthUniverse,
  options: EarthRelationAcquisitionOptions = {},
): Promise<EarthRelationAcquisitionResult> {
  const seedCelexes = normalizeSeeds(
    universe.members.map(({ celex }) => celex),
  );
  const query = buildEarthCellarRelationQuery(seedCelexes);
  const responseBytes = await fetchOfficialRelations(
    query,
    options.fetchImplementation ?? fetch,
  );
  const records = parseEarthCellarRelationResults(
    JSON.parse(new TextDecoder().decode(responseBytes)),
    seedCelexes,
  );
  const normalized = `${JSON.stringify(records, null, 2)}\n`;
  const contentHash = createHash("sha256")
    .update(query)
    .update("\n")
    .update(responseBytes)
    .digest("hex");
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const snapshot = earthCellarRelationSnapshotSchema.parse({
    schemaVersion: "1.0.0",
    snapshotId: `earth:cellar-relations:${contentHash}`,
    provenance: "official",
    sourceSystem: "cellar-sparql",
    queryVersion: RELATION_QUERY_VERSION,
    endpoint: CELLAR_SPARQL_ENDPOINT,
    retrievedAt,
    seedCelexes,
    querySha256: sha256(query),
    responseSha256: sha256(responseBytes),
    normalizedSha256: sha256(normalized),
    recordCount: records.length,
    files: {
      query: "query.rq",
      response: "response.json",
      normalized: "normalized.json",
    },
  });
  const root = resolve(
    process.cwd(),
    options.outputRoot ?? "data/raw/earth/cellar-relations",
  );
  const directoryName = `${retrievedAt.replaceAll(/[:.]/gu, "-")}-${contentHash.slice(0, 12)}`;
  const directory = resolve(root, directoryName);
  if (dirname(directory) !== root)
    throw new Error("Invalid Earth relation snapshot directory");
  const pending = resolve(
    root,
    `.${directoryName}.pending-${process.pid}-${randomUUID()}`,
  );
  await mkdir(root, { recursive: true });
  await mkdir(pending);
  await Promise.all([
    writeFile(resolve(pending, snapshot.files.query), `${query}\n`, "utf8"),
    writeFile(resolve(pending, snapshot.files.response), responseBytes),
    writeFile(resolve(pending, snapshot.files.normalized), normalized, "utf8"),
    writeFile(
      resolve(pending, "snapshot.json"),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    ),
  ]);
  await rename(pending, directory);
  return { directory, snapshot, records };
}

export async function readVerifiedEarthRelationSnapshot(
  providedDirectory: string,
): Promise<EarthRelationAcquisitionResult> {
  const directory = resolve(process.cwd(), providedDirectory);
  const snapshot = earthCellarRelationSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(directory, "snapshot.json"), "utf8")),
  );
  const query = await readFile(
    resolve(directory, snapshot.files.query),
    "utf8",
  );
  const responseBytes = new Uint8Array(
    await readFile(resolve(directory, snapshot.files.response)),
  );
  const normalized = await readFile(
    resolve(directory, snapshot.files.normalized),
    "utf8",
  );
  const expectedQuery = `${buildEarthCellarRelationQuery(snapshot.seedCelexes)}\n`;
  if (
    query !== expectedQuery ||
    sha256(query.trimEnd()) !== snapshot.querySha256
  ) {
    throw new Error("Earth relation query does not match its snapshot");
  }
  if (sha256(responseBytes) !== snapshot.responseSha256) {
    throw new Error("Earth relation response hash mismatch");
  }
  const records = parseEarthCellarRelationResults(
    JSON.parse(new TextDecoder().decode(responseBytes)),
    snapshot.seedCelexes,
  );
  const expectedNormalized = `${JSON.stringify(records, null, 2)}\n`;
  if (
    normalized !== expectedNormalized ||
    sha256(normalized) !== snapshot.normalizedSha256 ||
    records.length !== snapshot.recordCount
  ) {
    throw new Error("Earth normalized relations do not match their snapshot");
  }
  return { directory, snapshot, records };
}
